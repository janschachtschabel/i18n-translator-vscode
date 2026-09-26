import { Component, type ComponentChild, type ComponentType } from 'preact';

/**
 * A component that renders again only when one of its props changed (compared with `Object.is`), like
 * React's memo. Not from preact/compat, which also changes how Preact treats events (onChange as in React).
 */
export function memo<P extends object>(render: (props: P) => ComponentChild): ComponentType<P> {
  return class Memo extends Component<P> {
    override shouldComponentUpdate(next: P): boolean {
      return !sameProps(this.props, next);
    }

    override render(props: P): ComponentChild {
      return render(props);
    }
  };
}

function sameProps(a: object, b: object): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
}
