# Reactive X Component

Creates a ReactiveXComponent using RxJS as state management

### Install

```bash
yarn add reactive-x-component
```

```bash
npm i --save reactive-x-component
```

### Usage

**test.ts**
```ts
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

class Test extends Component {
  public readonly events$ = new Subject<number>();
}

const staticProps = {
  counter2: interval(5000),
};

export default ReactiveXComponent(staticProps)(Test);
```

**app.ts**
```ts
import Test from './test.ts';
import { interval } from 'rxjs';

const seconds$ = interval(1000);

const App = () => (<div>
  <Test counter={seconds$} // insert observable into property to be flattened
        message="This can be either an Observable<string> or string"  // can instert Observable<T> | T where T is the type.
        // no need to have `counter2` as a prop as it is supplied in the staticProps in the previous file.
        events$={event => console.log(event.data + 10)} // Pass a function to be subscribed on the public property
        />
</div>);
```

This function does two things:

 - Flattens each `Observable` prop into the wrapped components props. 

 - Pass a `function` or `Subscriber` into the component props, and it will be subscribed to the public property.
 
Each Observable is subscribed to on `componentDidMount`, and then are unsubscribed on `componentWillUnmount`.
