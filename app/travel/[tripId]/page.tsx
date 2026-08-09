'use client';

import React from 'react';
import { useParams } from 'next/navigation';

export default function Page() {
  const params = useParams();
  const tripId = params?.tripId ?? '';
  return (
    <div className="page-travel">
      <h1>Trip {tripId}</h1>
      <p>This page was temporarily simplified to fix a JSX syntax error in the Travel branch.</p>
    </div>
  );
}
