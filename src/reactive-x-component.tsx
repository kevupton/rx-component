import * as React from 'react';
import { Component, ComponentType, createRef } from 'react';
import { BehaviorSubject, Observable, PartialObserver, Subscription } from 'rxjs';
import { tap } from 'rxjs/internal/operators/tap';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
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

interface IPreviousValues {
  prevProps : Record<string, any>;
  prevState : Record<string, any>;
}

type StateWithPrevious = IState & IPreviousValues

const DEFAULT_STATE : (defaultValues? : Record<string, any>) => IState = (defaultValues = {}) => ({
  obsValues: {
    ...defaultValues,
  },
  basicProps: {},
});

interface IClassOptions {
  classDebugName? : string;
  persistState? : boolean;
}

export function ReactiveXComponent<StaticProps extends IStaticProps = {}>
(staticProps? : StaticProps, defaultState? : Partial<ObservableValues<StaticProps>>, debugName : string = '') {

  return function <CompType extends ComponentType<ObservableValues<StaticProps> & InferredProps<CompType>>> (
    WrappedComponent : CompType,
    { classDebugName = '', persistState = false } : IClassOptions = {},
  ) :
    ComponentType<Separate<CompType, StaticProps> & ClassFns<CompType>> {

    const o : (val : string) => any[] = (val : string) => val ? [val] : [];
    const args                        = [...o(debugName), ...o(classDebugName)];
    const info                        = logger.info.bind(logger, ...args);
    const debug                       = logger.debug.bind(logger, ...args);

    return class extends Component<any, IState> {
      public readonly state              = DEFAULT_STATE(defaultState);
      private readonly reference         = createRef<typeof WrappedComponent>();
      private readonly propSubscriptions = new Map<string, Subscription>();
      private readonly stateSubject      = new BehaviorSubject<StateWithPrevious>({
        ...this.state, prevProps: {}, prevState: this.state,
      });
      private subscriptions              = new Subscription();
      private acceptingStateUpdates      = true; // determines whether or not the updates are applied to state.

      constructor(props : any) {
        super(props);

        debug('Constructing ReactiveXComponent');
        debug('construction props: ', props);
      }

      public componentDidMount () {
        info('component did mount');

        debug('initializing with default values');
        debug('default state: ', this.stateSubject.value.prevState);

        /*
         IMPORTANT: This must run first so that it inherits all of the default values.
         Set the default state values for the subject.
         */
        this.update(this.stateSubject.value.prevState);

        this.listenToStateUpdates();
        this.subscribeToStaticProps(staticProps || {});

        // resubscribe to all of the props
        this.detectChanges(this.props);

        // start accepting state updates
        this.acceptingStateUpdates = true;

        debug('**[ON]** listening to state updates');
      }

      public componentWillUnmount () {
        // stop listening to state updates before we empty all of the subscriptions.
        this.acceptingStateUpdates = false;
        debug('**[OFF]** stopped listening to state updates');

        // force the object to unsubscribe to all subscriptions
        this.detectChanges({});
        // unsubscribe to all staticProps
        this.subscriptions.unsubscribe();

        this.subscriptions = new Subscription();
        info('component unmounting');
        debug('completing state: ', this.state);
      }

      public componentDidUpdate () {
        debug('component did update');
        this.detectChanges(this.props);
      }

      private detectChanges (props : any) {
        debug('triggering update');
        debug('props: ', props);

        const { prevProps } = this.stateSubject.value;
        this.update({ prevProps: props });

        this.updateObservableProps(prevProps, props);
        this.updateOtherProps(prevProps, props);
      }

      private updateOtherProps (prevProps : any, props : any) {
        const { added, different, changes, removed } = this.calculateDifferences(prevProps, props, false);

        if (changes) {

          info('Basic Props Changed');
          debug('changes: ', { added, different, removed });

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

        debug(`rendering component [${ isFnCmp ? 'FunctionComponent' : 'ComponentClass' }]`);

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
          info('Observables Changed');
          debug('changes: ', { added, different, removed });
        }
        different.concat(removed).forEach(prop => this.removePropSubscription(prop));
        added.concat(different).forEach(prop => this.addPropSubscription(prop, props));

        /*
         Remove the keys afterwards, in the scenario the observable simply just changes,
         we can keep the old value there until a new one is received.
         But if the key has been removed completely, then we should remove it completely also.
         */
        this.removeObservableKeys(removed);

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

      private addPropSubscription (prop : string, props : any) {
        const propValue                        = (props as any)[prop];
        const current : any                    = this.reference.current;
        let subscription : Subscription | null = null;

        if (propValue instanceof Observable) {
          info(`subscribing to observable [${ prop }]`);
          subscription = propValue.subscribe(result => this.updateObservableValue({ [prop]: result }));
        }
        else if (current && current.hasOwnProperty(prop)) {
          debug('found [' + prop + '] on reference component');
          if (this.isSubscriberType(propValue)) {
            const referenceValue = current[prop];

            // noinspection SuspiciousTypeOfGuard - Reason editor validation
            if (referenceValue instanceof Observable) {
              info(`sending subscriber for [${ prop }]`);
              subscription = referenceValue.subscribe(propValue);
            }
            else {
              logger.warning(`Received a subscribable property, but nothing to subscribe to. Prop: [${ prop }]`);
            }
          }
          else {
            logger.warning(`Received prop [${ prop }] which is also on component reference. ` +
              `However propValue is not of Subscriber type`);
            debug('propValue: ', propValue);
          }
        }

        if (subscription) {
          debug(`saving subscription [${ prop }]`);
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
        info(`unsubscribing to prop [${ prop }]`);
        subscription.unsubscribe();

        this.propSubscriptions.delete(prop);
      }

      private filterKeys (obj : any, isObservable = true) {
        return (key : string) => {
          const isRxjsCompat = (obj[key] instanceof Observable || this.isSubscriberType(obj[key]));
          return isObservable ? isRxjsCompat : !isRxjsCompat;
        };
      }

      private update (state : Partial<StateWithPrevious>) {
        this.stateSubject.next({
          ...this.stateSubject.value,
          ...state,
        });
      }

      private listenToStateUpdates () {
        const subscription = this.stateSubject.pipe(
          // dont update the state if we are not accepting updates (so that we dont delete default values on unmount)
          filter(() => this.acceptingStateUpdates),
          // merge multiple updates into just one. This way we dont spam setState
          debounceTime(0),
          // check on both sides incase inconsistencies
          filter(() => this.acceptingStateUpdates),
          // detect if there are changes with any of the objects
          distinctUntilChanged((a, b) => {
            return a.basicProps === b.basicProps && a.obsValues === b.obsValues;
          }),
          tap(() => info('updating state')),
          tap(({ obsValues, basicProps }) => debug('state: ', { ...basicProps, ...obsValues })),
        ).subscribe(({ basicProps, obsValues }) => {
          // register the previous state for persistence across mount / dismount
          if (persistState) {
            debug('persisting state');
            this.stateSubject.next({
              ...this.stateSubject.value,
              prevState: { ...this.state },
            });
          }

          this.setState({ basicProps, obsValues });
        });

        this.subscriptions.add(subscription);
      }

      private subscribeToStaticProps (obj : IStaticProps) {
        Object.keys(obj)
          .forEach(key => {
            this.subscriptions.add(
              obj[key].subscribe(value => this.updateObservableValue({ [key]: value })),
            );
          });
      }

      private updateObservableValue (obj : Record<string, any>) {
        debug('received observable value');
        debug('value: ', obj);

        this.update({
          obsValues: {
            ...this.stateSubject.value.obsValues,
            ...obj,
          },
        });
      }

      private removeObservableKeys (keys : string[]) {
        const obsValues = { ...this.stateSubject.value.obsValues };
        let changes     = false;

        keys.forEach(key => {
          if (obsValues.hasOwnProperty(key)) {
            debug(`removing observable value key [${ key }]`);
            delete obsValues[key];
            changes = true;
          }
          else {
            logger.warning(`'obsValues' has no key [${ key }] to delete`);
          }
        });

        // if there are actually changes then send an update
        if (changes) {
          this.update({ obsValues });
        }
      }
    };
  };
}

function isFunctionComponent (component : ComponentType<any>) {
  return typeof component === 'function' // can be various things
    && !(
      component.prototype // native arrows don't have prototypes
      && component.prototype.isReactComponent // special property
    );
}
