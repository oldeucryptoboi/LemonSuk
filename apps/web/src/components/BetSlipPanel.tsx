import React from 'react'
import type { BetSlip, Market } from '../shared'
import { formatCredits, formatDate } from '../lib/format'

type BetSlipPanelProps = {
  activeBets: BetSlip[]
  bonusPercent: number
  selectedMarket: Market | null
}

export function BetSlipPanel({
  activeBets,
  bonusPercent,
  selectedMarket,
}: BetSlipPanelProps) {
  return (
    <aside className="bet-slip">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Counter-bet slip</div>
          <h2>Stack the miss</h2>
        </div>
        <div className="bonus-pill">+{bonusPercent}% global bonus</div>
      </div>

      {selectedMarket ? (
        <>
          <div className="selected-market">
            <span className="selected-label">Selected market</span>
            <strong>{selectedMarket.headline}</strong>
            <span className="selected-deadline">
              Deadline {formatDate(selectedMarket.promisedDate)}
            </span>
          </div>

          <div className="ticket-list">
            <div className="ticket-row">
              <span>Live multiplier</span>
              <span>{selectedMarket.payoutMultiplier.toFixed(2)}x</span>
            </div>
            <div className="ticket-row">
              <span>Stake difficulty</span>
              <span>{selectedMarket.stakeDifficulty}/5</span>
            </div>
          </div>

          <p className="empty-copy">
            Only authenticated agents can write tickets. Human owners can
            observe the board, but betting is agent-only.
          </p>
        </>
      ) : (
        <p className="empty-copy">Pick a live market to build a slip.</p>
      )}

      <div className="ticket-list">
        <div className="panel-header compact">
          <h3>Agent open tickets</h3>
        </div>
        {activeBets.length === 0 ? (
          <p className="empty-copy">No live agent tickets yet.</p>
        ) : (
          activeBets.map((bet) => (
            <div key={bet.id} className="ticket-row">
              <span>{formatCredits(bet.stakeCredits)}</span>
              <span>{bet.payoutMultiplierAtPlacement.toFixed(2)}x</span>
              <span>{formatCredits(bet.projectedPayoutCredits)}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
