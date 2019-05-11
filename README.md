# Reactive X Component

Creates a **React** Component that uses **RxJS** as State management.

## Install

```bash
yarn add reactive-x-component
```

```bash
npm i --save reactive-x-component
```

----

## [Demo in Stackblitz](https://stackblitz.com/edit/reactive-x-component)

## [Example Project - Snap Game](https://github.com/kevupton/react-snap)

## Usage
```tsx
import { ReactiveXComponent } from 'reactive-x-component';

// simple wrap your ComponentType using the function and it will start accepting Observables
export default ReactiveXComponent()(Test);
```

## Examples
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

## API

#### **ReactiveXComponent**

```ts
ReactiveXComponent(staticProps, defaultValues)(componentType, options)
```

| Attribute      | Default      | Description                                                                                |
| ---------------| -------------|---------------------------------------------------------------------------------- |
| `staticProps`  | `{}`         | An object with values of `Observables<any>` which will be passed into the components props |
| `defaultValues`| `undefined`  | A `Partial<StaticProps>` which is the initial state value for these observables            |
| `componentType`| **Required** | A `ComponentType<any>`. Can be either a `FunctionComponent` or `ComponentClass`            |
| `options`      | `undefined`  | Used for debugging purposes only at this stage. You can specify a name to prefix the debug log |

Returns a component with props as `Observable<T> | T` and also *optional* `Subscriber<T>` for public observable attributes.

----

## FAQ

### How does it work?
This ReactiveXComponent does two things:

 - Flattens each `Observable` prop and passes their values to the child component. (Only if the prop is an `Observable`)
 ```tsx
 <Test counter={interval(1000)} /> // Flattens the interval into its value and passes it directly to the component.
 ```

 - Passes `function`s or `Subscriber`s from props into the child component public `Observable` property (if it exists).
 ```tsx
 public readonly eventEmitter$ = new Subject<Event>(); // passes them into something like this
 ```

### When does it subscribe?
Each Observable is subscribed to on `componentDidMount` or when it is passed in as a prop.

### When does it unsubscribe?
All observables are unsubscribed on `componentWillUnmount` or when the value changes.
