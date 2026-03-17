import React from 'react'
import type { DiscoveryReport } from '../shared'

type AgentConsoleProps = {
  query: string
  report: DiscoveryReport | null
  running: boolean
  onQueryChange: (query: string) => void
  onRun: () => void
}

export function AgentConsole({
  query,
  report,
  running,
  onQueryChange,
  onRun,
}: AgentConsoleProps) {
  return (
    <section className="agent-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Backend agent</div>
          <h2>Source discovery console</h2>
        </div>
      </div>
      <p className="agent-copy">
        Searches web results across news, blogs, official pages, and X/Twitter
        links, then classifies dated Musk promises and reconciles them into the
        current book.
      </p>
      <div className="agent-controls">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button
          type="button"
          className="primary-button"
          onClick={onRun}
          disabled={running}
        >
          {running ? 'Scanning…' : 'Run discovery'}
        </button>
      </div>
      <div className="agent-terminal">
        {report ? (
          <>
            <div>{`query: ${report.query}`}</div>
            <div>{`results: ${report.resultCount}`}</div>
            <div>{`candidates: ${report.candidateCount}`}</div>
            <div>{`created: ${report.createdMarketIds.length}`}</div>
            <div>{`updated: ${report.updatedMarketIds.length}`}</div>
            <div>{`discarded: ${report.discardedResults.length}`}</div>
          </>
        ) : (
          <div>awaiting discovery run…</div>
        )}
      </div>
    </section>
  )
}
