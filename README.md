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

https://stackblitz.com/edit/reactive-x-component?embed=1&file=index.tsx

### Usage

**Test.tsx**
```tsx
import React, { Component } from 'react';
import { Subject, interval } from 'rxjs';
import { ReactiveXComponent } from 'reactive-x-component';

interface Props {
  counter : number;
  counter2 : number;
  message : string;
}

interface Event {
  value : number;
}

class Test extends Component<Props> {
  public readonly events$ = new Subject<Event>();
  
  render() {
    const { counter, counter2, message } = this.props;
    return (<div>
      <span>{ message }</span>
      <div>Prop Counter: { counter }</div>
      <div>Static Counter: { counter2 }</div>
    </div>);
  }
}

const staticProps = {
  counter2: interval(5000),
};

export default ReactiveXComponent(staticProps)(Test);
```

**Example.tsx**
```tsx
import React from 'react';
import Test from './Test';
import { interval } from 'rxjs';

const seconds$ = interval(1000);

export default () => (<div>
  <Test counter={seconds$} // insert observable into property to be flattened
        message="Message: This can be either an Observable<string> or string"  // can instert Observable<T> | T where T is the type.
        // no need to have `counter2` as a prop as it is supplied in the staticProps in the previous file.
        events$={event => console.log(event.value + 10)} // Pass a function to be subscribed on the public property `events$`
        />
</div>);
```

This function does two things:

 - Flattens each `Observable` prop into the wrapped components props. 

 - Pass a `function` or `Subscriber` into the component props, and it will be subscribed to the public property.
 
Each Observable is subscribed to on `componentDidMount`, and then are unsubscribed on `componentWillUnmount`.
