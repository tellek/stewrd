import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  pluginId: string;
  children: ReactNode;
  /** Optional real reload (re-fetch source, re-activate) from the registry.
   * Falls back to just clearing the caught error and re-rendering if omitted. */
  onReload?: () => void;
}

interface State {
  error: Error | null;
}

/** Isolates a plugin's render/lifecycle errors to an inline error card instead
 * of crashing the whole app. Does NOT catch errors in event handlers, timers,
 * or promise rejections - see registerGlobalErrorHandlers for those. */
export class PluginErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[plugin:${this.props.pluginId}] render error`, error, info.componentStack);
  }

  private reload = () => {
    this.props.onReload?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 12, border: "1px solid #c33", background: "#fee", color: "#600" }}>
          <p>
            Plugin "{this.props.pluginId}" crashed: {this.state.error.message}
          </p>
          <button onClick={this.reload}>Reload this plugin</button>
        </div>
      );
    }
    return this.props.children;
  }
}
