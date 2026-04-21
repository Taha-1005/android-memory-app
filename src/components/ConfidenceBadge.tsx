import React from 'react';
import { StatusPill } from './StatusPill';

export function ConfidenceBadge({
  confidence,
}: {
  confidence: 'high' | 'medium' | 'low';
}): JSX.Element {
  const tone = confidence === 'high' ? 'ok' : confidence === 'medium' ? 'info' : 'warn';
  return <StatusPill label={`${confidence} confidence`} tone={tone} />;
}
