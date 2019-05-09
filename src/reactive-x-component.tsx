import * as React from 'react';
import { Component, ComponentType, createRef } from 'react';
import { BehaviorSubject, Observable, PartialObserver, Subscription } from 'rxjs';
import { tap } from 'rxjs/internal/operators/tap';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { logger } from './logger';

type ExceptValues<X, Y> = {
  [Key in keyof X] : Key extends keyof Y ? never : Key
};

type FilterObservables<X> = {
  [Key in keyof X] : Key extends 'context' ? never : X[Key] extends Observable<any> ? Key : never;
}

type AllExcept<X, Y> = keyof Y extends never ? X : Pick<X, ExceptValues<X, Y>[keyof X]>;
type AllObservables<X> = Pick<X, FilterObservables<X>[keyof X]>;
type Subscribable<T> = ((value : T) => void) | PartialObserver<T>;
type ObsFunctions<X> = {
  [Key in keyof X] : X[Key] extends Observable<infer R> ? Subscribable<R> : X[Key];
}
type ClassConstructor = new (...args : any) => any;
type ClassFns<T> = T extends ClassConstructor ? Partial<ObsFunctions<AllObservables<InstanceType<T>>>> : {};

type AllowBothOptions<T> = {
  [key in keyof T] : T[key] extends Observable<infer R> ? R | Observable<R> : Observable<T[key]> | T[key];
}

type Separate<T, Y> = AllowBothOptions<AllExcept<InferredProps<T>, Y>>;
type InferredProps<T> = T extends ComponentType<infer P> ? P : T;
type ObservableValues<T> = {
  [Key in keyof T] : T[Key] extends Observable<infer R> ? R : T[Key];
}

interface IStaticProps {
  [key : string] : Observable<any>;
}

interface IState {
  obsValues : Record<string, any>;
  basicProps : Record<string, any>;
}

interface IStateWithPrevProps extends IState {
  prevProps : Record<string, any>;
}

const DEFAULT_STATE : () => IStateWithPrevProps = () => ({
  obsValues: {}, basicProps: {}, prevProps: {},
});

export function ReactiveXComponent<StaticProps extends IStaticProps = {}>
(staticProps? : StaticProps, defaultState? : Partial<ObservableValues<StaticProps>>) {

  return function <CompType extends ComponentType<ObservableValues<StaticProps> & InferredProps<CompType>>> (WrappedComponent : CompType) :
    ComponentType<Separate<CompType, StaticProps> & ClassFns<CompType>> {

    return class extends Component<any, IState> {
      public readonly state              = { basicProps: {}, obsValues: defaultState || {} };
      private readonly reference         = createRef<typeof WrappedComponent>();
      private staticSubscriptions        = new Subscription();
      private readonly propSubscriptions = new Map<string, Subscription>();
      private readonly stateSubject      = new BehaviorSubject<IStateWithPrevProps>(DEFAULT_STATE());

      public componentDidMount () {
        logger.info('component did mount');
        this.listenToStateUpdates();
        this.subscribeToStaticProps();

        this.triggerUpdate(this.props);
      }

      public componentWillUnmount () {
        logger.info('component unmounting');
        this.triggerUpdate({});
        this.staticSubscriptions.unsubscribe();
        this.staticSubscriptions = new Subscription();
      }

      public componentDidUpdate () {
        logger.debug('component did update');
        this.triggerUpdate(this.props);
      }

      private triggerUpdate (props : any) {
        logger.debug('triggering update');
        logger.debug('props: ', props);

        const { prevProps } = this.stateSubject.value;
        this.update({ prevProps: props });

        this.updateObservableProps(prevProps, props);
        this.updateOtherProps(prevProps, props);
      }

      private updateOtherProps (prevProps : any, props : any) {
        const { added, different, changes, removed } = this.calculateDifferences(prevProps, props, false);

        if (changes) {

          logger.info('Basic Props Changed');
          logger.debug('changes: ', { added, different, removed });

          const newProps : any = {};
          added.concat(different).forEach(key =>
            newProps[key] = props[key],
          );

          this.update({ basicProps: newProps });
        }
      }

      public render () {
        const { obsValues, basicProps } = this.state;
        const values                    = { ...basicProps, ...obsValues };
        const W                         = WrappedComponent as any;
        const isFnCmp                   = isFunctionComponent(WrappedComponent);

        logger.debug(`rendering component [${isFnCmp ? 'FunctionComponent' : 'ComponentClass'}]`);

        if (isFnCmp) {
          return (
            <W { ...values } />
          );
        }
        else {
          return (
            <W { ...values } ref={ this.reference }/>
          );
        }
      }

      /**
       *
       * @param prevProps
       * @param props
       */
      private updateObservableProps (prevProps : any, props : any) {
        const { added, different, removed, changes } = this.calculateDifferences(prevProps, props);

        if (changes) {
          logger.info('Observables Changed');
          logger.debug('changes: ', { added, different, removed });
        }
        different.concat(removed).forEach(prop => this.removePropSubscription(prop));
        added.concat(different).forEach(prop => this.addPropSubscription(prop, props));

        return changes;
      }

      private calculateDifferences (prevProps : any, currProps : any, withRxjsItems = true) {
        const prevKeys = Object.keys(prevProps).filter(this.filterKeys(prevProps, withRxjsItems));
        const currKeys = Object.keys(currProps).filter(this.filterKeys(currProps, withRxjsItems));

        const removed : string[]   = [];
        const added : string[]     = [...currKeys];
        const different : string[] = [];

        prevKeys.forEach(key => {
          const index = added.indexOf(key);
          if (index >= 0) {
            added.splice(index, 1);

            if (currProps[key] !== prevProps[key]) {
              different.push(key);
            }
          }
          else if (typeof currProps[key] === 'undefined') {
            removed.push(key);
          }
        });

        return {
          removed, added, different,
          changes: added.length + removed.length + different.length > 0,
        };
      }

      /**
       *
       * @param prop
       */
      private addPropSubscription (prop : string, props : any) {
        const propValue                        = (props as any)[prop];
        const current : any                    = this.reference.current;
        let subscription : Subscription | null = null;

        if (propValue instanceof Observable) {
          logger.info(`subscribing to observable [${ prop }]`);
          subscription = propValue.subscribe(result => this.update({
            obsValues: {
              ...this.stateSubject.value.obsValues,
              [prop]: result,
            },
          }));
        }
        else if (current && current.hasOwnProperty(prop)) {
          logger.debug('found [' + prop + '] on reference component');
          if (this.isSubscriberType(propValue)) {
            const referenceValue = current[prop];

            // noinspection SuspiciousTypeOfGuard - Reason editor validation
            if (referenceValue instanceof Observable) {
              logger.info(`sending subscriber for [${ prop }]`);
              subscription = referenceValue.subscribe(propValue);
            }
            else {
              logger.warning(`Received a subscribable property, but nothing to subscribe to. Prop: [${ prop }]`);
            }
          }
          else {
            logger.warning(`Received prop [${ prop }] which is also on component reference. ` +
              `However propValue is not of Subscriber type`);
            logger.debug('propValue: ', propValue);
          }
        }

        if (subscription) {
          logger.debug(`saving subscription [${ prop }]`);
          this.propSubscriptions.set(prop, subscription);
        }
      }

      private isSubscriberType (value : any) {
        return typeof value === 'function' ||
          (value && (['next', 'complete', 'error']
            .find(key => value.hasOwnProperty(key) && typeof value[key] === 'function')));
      }

      /**
       *
       * @param prop
       */
      private removePropSubscription (prop : string) {
        const subscription = this.propSubscriptions.get(prop);
        if (!subscription) {
          logger.warning(`no subscription found for [${ prop }]`);
          return;
        }
        logger.info(`unsubscribing to prop [${ prop }]`);
        subscription.unsubscribe();
        this.propSubscriptions.delete(prop);
      }

      private filterKeys (obj : any, isObservable = true) {
        return (key : string) => {
          const isRxjsCompat = (obj[key] instanceof Observable || this.isSubscriberType(obj[key]));
          return isObservable ? isRxjsCompat : !isRxjsCompat;
        };
      }

      private update (state : Partial<IStateWithPrevProps>) {
        this.stateSubject.next({
          ...this.stateSubject.value,
          ...state,
        });
      }

      private listenToStateUpdates () {
        const subscription = this.stateSubject.pipe(
          debounceTime(0),
          distinctUntilChanged((a, b) => {
            return a.basicProps === b.basicProps && a.obsValues === b.obsValues;
          }),
          tap(() => logger.info('updating state')),
          tap(({ obsValues, basicProps }) => logger.debug('state: ', { ...basicProps, ...obsValues })),
        ).subscribe(({ obsValues, basicProps }) => this.setState({ obsValues, basicProps }));

        this.staticSubscriptions.add(subscription);
      }

      private subscribeToStaticProps () {
        Object.keys(staticProps as any)
          .forEach(key => {
            this.staticSubscriptions.add(
              (staticProps as any)[key].subscribe((value : string) => this.update({
                obsValues: {
                  ...this.stateSubject.value.obsValues,
                  [key]: value,
                },
              })),
            );
          });
      }
    };
  };
}

function isFunctionComponent (component : ComponentType<any>) {
  return !!(
    typeof component === 'function' &&
    String(component).includes('return React.createElement')
  );
}
