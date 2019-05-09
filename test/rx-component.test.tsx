import * as React from 'react';
import { Component } from 'react';
import { interval } from 'rxjs';
import { ReactiveXComponent } from '../src';

interface TestProps {
  counter : number;
  counter$ : number;
  c : number;
}

interface TestProps2 {

}

class Test extends Component<TestProps> {
  public readonly value$ = interval(1000);

  render () {
    return (<div>{ }</div>);
  }
}

class Test2 extends Component<TestProps2> {
  public readonly value$ = interval(1000);

  render () {
    return (<div>{ }</div>);
  }
}

const RxTest = ReactiveXComponent({ c: interval(1000) })(Test);
const RxTest2 = ReactiveXComponent()(Test2);

export default RxTest;
export const App = () => (<div>
  <RxTest2 value$={() => {}}/>
  <RxTest counter={ 2 } counter$={ interval(2000) } value$={ { next: v => v.toExponential(2) } }/>
</div>);

export const FnTest = ReactiveXComponent({ berf: interval(1000) })(({ berf }) => (
  <div>{ berf }</div>
));
