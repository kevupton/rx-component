import * as React from 'react';
import { Component, ComponentType, createRef } from 'react';
import { BehaviorSubject, Observable, PartialObserver, Subscription } from 'rxjs';
import { tap } from 'rxjs/internal/operators/tap';
import { debounceTime, distinctUntilKeyChanged } from 'rxjs/operators';
import { logger } from './logger';

type ExceptValues<X, Y> = {
  [Key in keyof X] : Key extends keyof Y ? never : Key
};

type FilterObservables<X> = {
  [Key in keyof X] : Key extends 'context' ? never : X[Key] extends Observable<any> ? Key : never;
}

type AllExcept<X, Y> = keyof Y extends never ? X : Pick<X, ExceptValues<X, Y>[keyof X]>;
type AllObservables<X> = Pick<X, FilterObservables<X>[keyof X]>;
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
  state : Record<string, any>;
}

type Subscribable<T = any> = PartialObserver<T> | ((value : T) => void);

interface DefaultRecord {
  key : string;
  subscription? : Subscription;
}

interface ObservableRecord extends DefaultRecord {
  value : Observable<any>;
  obs$ : Observable<any>;
}

interface SubscriberRecord extends DefaultRecord {
  value : Subscribable;
  obs$ : Observable<any>;
}

interface BasicRecord extends DefaultRecord {
  value : any;
  obs$? : undefined;
}

type PropRecord = BasicRecord | SubscriberRecord | ObservableRecord;

interface IPreviousValues {
  prevRecords : PropRecord[];
}

type StateWithPrevious = IState & IPreviousValues

const DEFAULT_STATE : (defaultValues? : Record<string, any>) => IState = (defaultValues = {}) => ({
  state: {
    ...defaultValues,
  },
});

interface IClassOptions {
  classDebugName? : string;
}

interface PropRecordDifference {
  oldRecord : PropRecord;
  newRecord : PropRecord;
}

interface PropChanges {
  added : PropRecord[];
  different : PropRecordDifference[];
  removed : PropRecord[];
  changes : number;
}

export function ReactiveXComponent<StaticProps extends IStaticProps = {}>
(staticProps? : StaticProps, defaultState? : Partial<ObservableValues<StaticProps>>) {

  return function <CompType extends ComponentType<ObservableValues<StaticProps> & InferredProps<CompType>>> (
    WrappedComponent : CompType,
    { classDebugName = '' } : IClassOptions = {},
  ) :
    ComponentType<Separate<CompType, StaticProps> & ClassFns<CompType>> {

    const args : any[] = classDebugName ? [classDebugName] : [];
    const info         = logger.info.bind(logger, ...args);
    const debug        = logger.debug.bind(logger, ...args);
    const warning      = logger.warning.bind(logger, ...args);

    return class extends Component<any, IState> {
      public readonly state          = DEFAULT_STATE(defaultState);
      private readonly reference     = createRef<typeof WrappedComponent>();
      private readonly stateSubject  = new BehaviorSubject<StateWithPrevious>({
        ...this.state, prevRecords: [],
      });
      private readonly subscriptions = new Subscription();

      constructor (props : any) {
        super(props);

        debug('Constructing ReactiveXComponent');
        debug('construction props: ', props);
      }

      public componentDidMount () {
        info('component did mount');

        debug('initializing with default values');
        debug('default state: ', this.stateSubject.value.state);

        this.listenToStateUpdates();
        this.subscribeToStaticProps(staticProps || {});

        // resubscribe to all of the props
        this.detectChanges(this.props);
      }

      public componentWillUnmount () {
        info('component unmounting. Unsubscribing from all Observables');
        // unsubscribe to all staticProps
        this.subscriptions.unsubscribe();
      }

      public componentDidUpdate () {
        debug('component did update');
        this.detectChanges(this.props);
      }

      private detectChanges (props : Record<string, any>) {
        debug('detecting changes for props');
        debug('props: ', props);

        const { prevRecords } = this.stateSubject.value;
        const currRecords     = this.getPropRecords(props);

        const diff = this.calculateDifferences(prevRecords, currRecords);

        this.handleChanges(diff);

        this.update({ prevRecords: currRecords });
      }

      private getPropRecords (props : Record<string, any>) : PropRecord[] {
        return Object.keys(props).map(key => {
          let obs$ : any = props[key] instanceof Observable ? props[key] : undefined;

          if (!obs$ && this.isSubscriberType(props[key])) {
            const current : any = this.reference.current;

            if (current) {
              obs$ = current[key] instanceof Observable ? current[key] : undefined;

              if (!obs$) {
                warning('received a Subscriber type but nothing to subscribe to: [' + key + ']');
              }
            }
          }

          const record : PropRecord = {
            key,
            value: props[key],
            obs$,
          };

          return record;
        });
      }

      public render () {
        const { state } = this.state;
        const W         = WrappedComponent as any;
        const isFnCmp   = isFunctionComponent(WrappedComponent);

        debug(`rendering component [${ isFnCmp ? 'FunctionComponent' : 'ComponentClass' }]`);

        if (isFnCmp) {
          return (
            <W { ...state } />
          );
        }
        else {
          return (
            <W { ...state } ref={ this.reference }/>
          );
        }
      }

      private handleChanges ({ different, added, removed, changes } : PropChanges) {
        if (!changes) {
          return;
        }

        info('changes identified');
        debug('changes: ', { added, different, removed, changes });

        const newState = { ...this.stateSubject.value.state };

        const addToState = (record : PropRecord) => {
          const { key, value, obs$ } = record;
          if (obs$) {
            const subscriber = obs$ === value ? this.handleUpdateFn(key) : value;
            debug(`subscribing to props [${ key }]`);
            record.subscription = obs$.subscribe(subscriber);
            this.subscriptions.add(record.subscription);
          }
          else {
            newState[key] = value;
          }
        };

        const unsubscribe = ({ key, subscription } : PropRecord) => {
          if (subscription) {
            info(`unsubscribing to prop [${ key }]`);
            subscription.unsubscribe();
          }
        };

        removed.forEach(record => {
          unsubscribe(record);
          delete newState[record.key];
        });

        different.forEach(({ oldRecord, newRecord }) => {
          unsubscribe(oldRecord);
          addToState(newRecord);
        });

        added.forEach(addToState);
      }

      private handleUpdateFn (key : string) {
        return (value : any) => {
          debug('received updated value');
          debug({ [key]: value });
          this.updateState({
            [key]: value,
          });
        };
      }

      private calculateDifferences (prevRecords : PropRecord[], currRecords : PropRecord[]) : PropChanges {
        const removed : PropRecord[]             = [];
        const added : PropRecord[]               = [...currRecords];
        const different : PropRecordDifference[] = [];

        prevRecords.forEach(prevRecord => {
          const index = added.findIndex(record => record.key === prevRecord.key);
          if (index >= 0) {
            const currRecord = added.splice(index, 1)[0];

            // this comparison checks if the observable value or default value has changed
            if (currRecord.value !== prevRecord.value || currRecord.obs$ !== prevRecord.obs$) {
              different.push({
                oldRecord: prevRecord,
                newRecord: currRecord,
              });
            }
          }
          else {
            removed.push(prevRecord);
          }
        });

        return {
          removed, added, different,
          changes: added.length + removed.length + different.length,
        };
      }

      private isSubscriberType (value : any) : value is Subscribable {
        return typeof value === 'function' ||
          (typeof value === 'object' && (!!['next', 'complete', 'error']
            .find(key => value.hasOwnProperty(key) && typeof value[key] === 'function')));
      }

      private update (state : Partial<StateWithPrevious>) {
        this.stateSubject.next({
          ...this.stateSubject.value,
          ...state,
        });
      }

      private updateState (state : Record<string, any>) {
        this.update({
          ...this.stateSubject.value.state,
          ...state,
        });
      }

      private listenToStateUpdates () {
        this.subscriptions.add(this.stateSubject.pipe(
          // merge multiple updates into just one. This way we dont spam setState
          debounceTime(0),
          // detect if there are changes with any of the objects
          distinctUntilKeyChanged('state'),
          tap(() => info('updating state')),
          tap(({ state }) => debug('state: ', state)),
        ).subscribe(({ state }) => this.setState({ state })));
      }

      private subscribeToStaticProps (obj : IStaticProps) {
        Object.keys(obj)
          .forEach(key => {
            debug(`subscribing to StaticProp [${ key }]`);
            this.subscriptions.add(
              obj[key].subscribe(this.handleUpdateFn(key)),
            );
          });
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
