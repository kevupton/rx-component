# Reactive X Component

Creates a ReactiveXComponent using RxJS as state management

### Install

```bash
yarn add reactive-x-component
```

```bash
npm i --save reactive-x-component
```

### Stackblitz

[Demo in Action](https://stackblitz.com/edit/reactive-x-component)

### Usage

**Test.tsx**
```tsx
import React, { Component } from 'react';
import { Subject, interval } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { ReactiveXComponent } from 'reactive-x-component';

interface Props {
  counter : number;
  counter2 : number | string;
  message : string;
}

interface Event {
  value : string;
}

class Test extends Component<Props> {
  public readonly events$ = new Subject<Event>();
  
  render() {
    const { counter, counter2, message } = this.props;

    this.events$.next({
      value: 'Received new event: RENDERED'
    });

    return (<div style={{ fontSize: '18px'}}>
      <table>
      <tbody>
        <tr><td>Message:</td><td>{ message }</td></tr>
        <tr><td>Prop Counter:</td><td>{ counter }</td></tr>
        <tr><td>Static Counter:</td><td>{ counter2 }</td></tr>
      </tbody>
      </table>
    </div>);
  }
}

const staticProps = {
  counter2: interval(5000).pipe(startWith('Loading...')),
};

export default ReactiveXComponent(staticProps)(Test);
```

**Example.tsx**
```tsx
import React from 'react';
import Test from './Test';
import { interval } from 'rxjs';
import { startWith } from 'rxjs/operators';
import FunctionComponent from './FunctionComponent';

const seconds$ = interval(1000).pipe(startWith(0));

export default () => (<div>
  <Test counter={seconds$} // insert observable into property to be flattened
        message="This can be either an Observable<string> or string"  // can instert Observable<T> | T where T is the type.
        // no need to have `counter2` as a prop as it is supplied in the staticProps in the previous file.
        events$={event => console.log(event.value)} // Pass a function to be subscribed on the public property `events$`
        />
  <FunctionComponent />
</div>);
```

This function does two things:

 - Flattens each `Observable` prop into the wrapped components props. 

 - Pass a `function` or `Subscriber` into the component props, and it will be subscribed to the public property.
 
Each Observable is subscribed to on `componentDidMount`, and then are unsubscribed on `componentWillUnmount`.
