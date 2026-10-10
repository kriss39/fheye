import { Component, type ReactNode } from 'react'

/** Keeps one broken page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="card stack tight">
        <h2>Something went wrong on this page.</h2>
        <p className="muted">{this.state.error.message}</p>
        <a className="btn primary" href="#/" onClick={() => this.setState({ error: null })} style={{ alignSelf: 'flex-start' }}>
          Back to the home page
        </a>
      </section>
    )
  }
}
