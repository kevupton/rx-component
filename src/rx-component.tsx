import * as React from 'react';
import { Component, ComponentClass, ComponentType, createRef, FunctionComponent } from 'react';
import { BehaviorSubject, Observable, PartialObserver, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

type ExceptValues<X, Y> = {
  [Key in keyof X] : Key extends keyof Y ? never : Key
};

type FilterValues<X, Y> = {
  [Key in keyof X] : X[Key] extends Y ? Key : never;
}

type AllExcept<X, Y> = keyof Y extends never ? X : Pick<X, ExceptValues<X, Y>[keyof X]>;
type AllObservables<X> = Pick<X, FilterValues<X, Observable<any>>[keyof X]>;
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
type InferredProps<T> = T extends ComponentType<infer P> ? P : never;
type ObservableValues<T> = {
  [Key in keyof T] : T[Key] extends Observable<infer R> ? R : T[Key];
}

interface IStaticProps {
  [key : string] : Observable<any>;
}

interface IState {
  data : Record<string, any>;
  props : Record<string, any>;
}

interface IStateWithPrevProps extends IState {
  prevProps : Record<string, any>;
}

const DEFAULT_STATE : () => IStateWithPrevProps = () => ({
  data: {}, props: {}, prevProps: {},
});

export function ReactiveXComponent<StaticProps extends IStaticProps, Props extends ObservableValues<StaticProps> = any>
(staticProps? : StaticProps, defaultState? : Partial<ObservableValues<StaticProps>>) {

  return function <CompType extends ComponentType<Props>> (WrappedComponent : CompType) :
    ComponentType<Separate<CompType, StaticProps> & ClassFns<CompType>> {

    return class extends Component<any, IState> {
      public readonly state              = { props: {}, data: defaultState || {} };
      private readonly reference         = createRef<typeof WrappedComponent>();
      private staticSubscriptions        = new Subscription();
      private readonly propSubscriptions = new Map<string, Subscription>();
      private readonly stateSubject      = new BehaviorSubject<IStateWithPrevProps>(DEFAULT_STATE());

      public componentDidMount () {
        // console.log('component did mount');
        this.listenToStateUpdates();
        this.subscribeToStaticProps();

        this.triggerUpdate(this.props);
      }

      public componentWillUnmount () {
        // console.log('component unmounting');
        this.triggerUpdate({});
        this.staticSubscriptions.unsubscribe();
        this.staticSubscriptions = new Subscription();
      }

      public componentDidUpdate () {
        // console.log('component did update');
        this.triggerUpdate(this.props);
      }

      private triggerUpdate (props : any) {
        const { prevProps } = this.stateSubject.value;
        this.update({ prevProps: props });

        this.subscribeToProps(prevProps, props);
        this.updateOtherProps(prevProps, props);
      }

      private updateOtherProps (prevProps : any, props : any) {
        const { added, different, changes } = this.calculateDifferences(prevProps, props, false);

        if (changes) {
          const newProps : any = {};
          added.concat(different).forEach(key =>
            newProps[key] = props[key],
          );

          this.update({ props: newProps });
        }
      }

      public render () {
        const { data, props } = this.state;
        const values          = { ...props, ...data };
        const W               = WrappedComponent as any;
        if (isFunctionComponent(WrappedComponent)) {
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
      private subscribeToProps (prevProps : any, props : any) {
        const { added, different, removed, changes } = this.calculateDifferences(prevProps, props);

        // if (changes) {
        //   console.log(added, different, removed);
        // }
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
        let subscription : Subscription | null = null;

        if (propValue instanceof Observable) {
          // console.log('subscribing to observable ' + prop);
          subscription = propValue.subscribe(result => this.update({
            data: {
              ...this.stateSubject.value.data,
              [prop]: result,
            },
          }));
        }
        else if (this.isSubscribable(propValue)) {
          const current : any = this.reference.current;

          if (current && current.hasOwnProperty(prop)) {
            const referenceValue = current[prop];

            // noinspection SuspiciousTypeOfGuard - Reason editor validation
            if (referenceValue instanceof Observable) {
              // console.log('subscribing to observable ' + prop);
              subscription = referenceValue.subscribe(propValue);
            }
          }
        }

        if (subscription) {
          // console.log('setting sub', prop);
          this.propSubscriptions.set(prop, subscription);
        }
      }

      private isSubscribable (value : any) {
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
          // console.log('no subscription found for ' + prop);
          return;
        }
        // console.log('unsubscribing to prop', prop);
        subscription.unsubscribe();
        this.propSubscriptions.delete(prop);
      }

      private filterKeys (obj : any, isObservable = true) {
        return (key : string) => {
          const isRxjsCompat = (obj[key] instanceof Observable || typeof obj[key] === 'function');
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
            return a.data === b.data && a.props === b.props;
          }),
        ).subscribe(({ data, props }) => this.setState({ data, props }));

        this.staticSubscriptions.add(subscription);
      }

      private subscribeToStaticProps () {
        Object.keys(staticProps as any)
          .forEach(key => {
            this.staticSubscriptions.add(
              (staticProps as any)[key].subscribe((value : string) => this.update({
                data: {
                  ...this.stateSubject.value.data,
                  [key]: value,
                },
              })),
            );
          });
      }
    };
  };
}

function isClassComponent<T = any> (component : ComponentType<any>) : component is ComponentClass<T> {
  return !!(
    typeof component === 'function' &&
    !!component.prototype.isReactComponent
  );
}

function isFunctionComponent<T = any> (component : ComponentType<T>) : component is FunctionComponent<T> {
  return !!(
    typeof component === 'function' &&
    String(component).includes('return React.createElement')
  );
}
