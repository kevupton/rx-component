import * as React from 'react';
import { Component } from 'react';
import { interval, Observable } from 'rxjs';
import { RxComponent } from '../src';

interface TestProps {
  counter : number;
  counter$ : number;
}

class Test extends Component<TestProps> {
  public readonly value$ = interval(1000);

  render () {
    return (<div>{ }</div>);
  }
}

const RxTest = RxComponent()(Test);

export default RxTest;
export const App = () => (<div>
  <RxTest counter={ 2 } counter$={ interval(2000) } value$={ { next: v => v.toExponential(2) } }/>
</div>);

export const FnTest = RxComponent<{ b : Observable<number> }, { b : number }>({ b: interval(1000) })(({ b }) => (
  <div>{ b }</div>
));
