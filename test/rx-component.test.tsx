import * as React from 'react';
import { Component } from 'react';
import { interval, Subject } from 'rxjs';
import { RxComponent } from '../src';

interface TestProps {
  counter : number;
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
  <RxTest counter={ new Subject() } value$={ { next: v => v.toExponential(2) } }/>
</div>);

