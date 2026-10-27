import React, { useState } from 'react';

/**
 * Format timestamp into readable localized Indian Standard Time (IST)
 */
function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (_e) {
    return isoString;
  }
}

/**
 * AlertPanel Component - Industrial Geotechnical Alarm Notification with Query Resolution
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function AlertPanel({ 
  n3Node, 
  isAlertActive = false, 
  isAcknowledged = false,
  isResolved = false,
  resolvedAt = null,
  resolvedBy = null,
  onAcknowledgeAlert,
  onResolveAlert,
  onFocusNode 
}) {
  const [showResolveInput, setShowResolveInput] = useState(false);
  const [notes, setNotes] = useState('Ground deformation inspected and verified safe by shift supervisor.');
  const [submitting, setSubmitting] = useState(false);

  const handleResolveSubmit = async () => {
    if (!onResolveAlert) return;
    setSubmitting(true);
    try {
      await onResolveAlert(notes);
      setShowResolveInput(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Case 1: All nominal / safe
  if (!isAlertActive && !isResolved) {
    return (
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 font-sans text-xs select-none">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="text-[#3F7655] font-bold text-sm">●</span>
          <div>
            <span className="font-bold text-[#222222]">SYSTEM STATE: SAFE</span>
            <span className="text-[#666666] ml-2 text-[11px] sm:text-xs">All surface inclinometers within baseline limits (&lt; 1.00°).</span>
          </div>
        </div>
        <span className="font-semibold text-[#3F7655] bg-[#3F7655]/10 px-2 py-0.5 border border-[#3F7655]/30 text-[11px]">
          ● SAFE
        </span>
      </div>
    );
  }

  // Case 2: Resolved
  if (isResolved) {
    return (
      <div className="bg-[#FFFFFF] border-l-4 border-l-[#3F7655] border border-[#D8D8D5] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 font-sans text-xs select-none">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="text-[#3F7655] font-bold text-sm">✓</span>
          <div>
            <span className="font-bold text-[#3F7655]">HAZARD QUERY RESOLVED &amp; LOGGED</span>
            <span className="text-[#666666] ml-2 text-[11px] sm:text-xs">
              Strata deformation cleared in database {resolvedAt ? `at ${formatTime(resolvedAt)}` : ''} {resolvedBy ? `by ${resolvedBy}` : ''}.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#3F7655] bg-[#F0FDF4] px-2 py-0.5 border border-[#BBF7D0] text-[11px]">
            ✓ RESOLVED IN DB
          </span>
          <button
            onClick={() => onFocusNode && onFocusNode('N3')}
            className="text-xs text-[#3F4A42] hover:underline font-semibold"
          >
            View Node N3 →
          </button>
        </div>
      </div>
    );
  }

  // Case 3: Acknowledged, pending resolution
  if (isAcknowledged) {
    return (
      <div className="bg-[#FFFFFF] border-l-4 border-l-[#A87925] border border-[#D8D8D5] p-3.5 sm:p-4 font-sans text-xs select-none space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="text-[#A87925] font-bold text-sm">●</span>
            <div>
              <span className="font-bold text-[#222222]">ALARM ACKNOWLEDGED — UNDER INVESTIGATION</span>
              <span className="text-[#666666] ml-2 text-[11px] sm:text-xs">
                Node N3 alert logged in shift register. Awaiting final resolution clearance.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showResolveInput && (
              <button
                onClick={() => setShowResolveInput(true)}
                className="px-3 py-1 bg-[#3F7655] hover:bg-[#325E44] text-[#FFFFFF] font-semibold text-xs transition-colors"
              >
                Resolve Query
              </button>
            )}
            <button
              onClick={() => onFocusNode && onFocusNode('N3')}
              className="text-xs text-[#3F4A42] hover:underline font-semibold"
            >
              View Node N3 →
            </button>
          </div>
        </div>

        {showResolveInput && (
          <div className="p-3 bg-[#FEFDF8] border border-[#D8D8D5] space-y-2">
            <label className="block text-[11px] font-semibold text-[#222222]">
              Resolution Notes (Recorded in PostgreSQL/Supabase):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 border border-[#D8D8D5] text-xs bg-[#FFFFFF]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResolveInput(false)}
                className="px-2 py-1 bg-[#FFFFFF] border border-[#D8D8D5] text-xs"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={handleResolveSubmit}
                className="px-3 py-1 bg-[#3F7655] hover:bg-[#325E44] text-[#FFFFFF] text-xs font-bold"
              >
                {submitting ? 'Saving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Case 4: Active and unacknowledged
  const currentTilt = n3Node ? n3Node.tilt.toFixed(2) : '2.40';

  return (
    <div className="bg-[#FFFFFF] border-l-4 border-l-[#A84444] border border-[#D8D8D5] p-3.5 sm:p-4 font-sans select-none space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#A84444] animate-pulse">● CRITICAL DEFORMATION</span>
            <span className="text-[#666666]">| Node N3 (Zone C)</span>
            <span className="px-1.5 py-0.2 bg-[#FDF2F2] border border-[#F3C5C5] text-[#A84444] font-mono text-[9px] font-bold">
              OPEN QUERY
            </span>
          </div>
          <div className="text-[#222222] font-semibold mt-1">
            Tilt escalated to {currentTilt}° (Critical Limit: 2.00°) • Primary indicator: Resultant inclination rate
          </div>
          <div className="text-[#666666] text-[11px] mt-0.5">
            Anomaly score: 96 / 100 • DGMS statutory compliance breach
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onAcknowledgeAlert}
            className="px-3 py-1.5 bg-[#A87925] hover:bg-[#8F661E] text-[#FFFFFF] font-semibold text-xs transition-colors"
          >
            Acknowledge
          </button>
          {!showResolveInput && (
            <button
              onClick={() => setShowResolveInput(true)}
              className="px-3 py-1.5 bg-[#3F7655] hover:bg-[#325E44] text-[#FFFFFF] font-semibold text-xs transition-colors"
            >
              Resolve
            </button>
          )}
          <button
            onClick={() => onFocusNode && onFocusNode('N3')}
            className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F7F7F5] text-[#222222] border border-[#D8D8D5] font-semibold text-xs transition-colors"
          >
            View Node
          </button>
        </div>
      </div>

      {showResolveInput && (
        <div className="p-3 bg-[#FEFDF8] border border-[#D8D8D5] space-y-2">
          <label className="block text-[11px] font-semibold text-[#222222]">
            Resolution Notes (Recorded in PostgreSQL/Supabase):
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-2 py-1.5 border border-[#D8D8D5] text-xs bg-[#FFFFFF]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowResolveInput(false)}
              className="px-2 py-1 bg-[#FFFFFF] border border-[#D8D8D5] text-xs"
            >
              Cancel
            </button>
            <button
              disabled={submitting}
              onClick={handleResolveSubmit}
              className="px-3 py-1 bg-[#3F7655] hover:bg-[#325E44] text-[#FFFFFF] text-xs font-bold"
            >
              {submitting ? 'Saving...' : 'Confirm Resolution'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
