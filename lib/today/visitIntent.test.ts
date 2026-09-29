import { describe, it, expect } from 'vitest';
import {
  classifyVisitIntent,
  isRouteStop,
  personalVisitEvidenceFromHistory,
  visitScore,
} from './visitIntent';

const site = { lat: -41.3, lng: 174.8 };
const home = { lat: -41.28, lng: 174.77 };
const work = { lat: -41.29, lng: 174.78 };
const bases = { home, work };

describe('visitIntent personal/structural', () => {
  it('desk language + coords stays context for everyone', () => {
    expect(
      classifyVisitIntent(
        { text: 'Email client about invoice', lat: site.lat, lng: site.lng, location_text: '14 Belgium Rd' },
        { bases, profile: { workType: 'trades_field', travelEmphasis: true } }
      )
    ).toBe('context_only');
  });

  it('field profile + place away from base → visit without niche keywords', () => {
    expect(
      classifyVisitIntent(
        {
          text: 'Smith property front lawn',
          lat: site.lat,
          lng: site.lng,
          location_text: '12 Oak Ave',
        },
        { bases, profile: { workType: 'trades_field', travelEmphasis: true } }
      )
    ).toBe('must_visit');
  });

  it('lawn-care style task with place is visit under field prior', () => {
    expect(
      classifyVisitIntent(
        {
          text: 'Mow and edge',
          lat: site.lat,
          lng: site.lng,
          location_text: '44 River Rd',
        },
        { bases, profile: { workType: 'field_service', travelEmphasis: true } }
      )
    ).toBe('must_visit');
  });

  it('office profile + job-inherited coords only → usually context', () => {
    expect(
      classifyVisitIntent(
        { text: 'Prep proposal', lat: site.lat, lng: site.lng, job_id: 'j1' },
        { bases, profile: { workType: 'office', travelEmphasis: false } }
      )
    ).toBe('context_only');
  });

  it('high personal visit rate tips located place work to visit', () => {
    expect(
      classifyVisitIntent(
        {
          text: 'Weekly stop',
          lat: site.lat,
          lng: site.lng,
          location_text: '9 Hill St',
        },
        {
          bases,
          profile: { workType: null, travelEmphasis: false },
          personal: { visitRate: 0.8, samples: 10 },
        }
      )
    ).toBe('must_visit');
  });

  it('without coords never a route stop', () => {
    expect(
      classifyVisitIntent(
        { text: 'Mow lawn at client', location_text: '12 Oak' },
        { bases, profile: { workType: 'trades_field', travelEmphasis: true } }
      )
    ).toBe('context_only');
  });

  it('personal evidence helper needs a few located samples', () => {
    const ev = personalVisitEvidenceFromHistory(
      [
        { text: 'Mow', lat: site.lat, lng: site.lng },
        { text: 'Edge', lat: site.lat + 0.02, lng: site.lng },
        { text: 'Email', lat: site.lat + 0.03, lng: site.lng },
      ],
      bases
    );
    expect(ev.samples).toBe(3);
    expect(ev.visitRate).not.toBeNull();
    expect(ev.visitRate! > 0.5).toBe(true);
  });

  it('near home is never a stop', () => {
    expect(
      isRouteStop(
        { text: 'Anything', lat: home.lat, lng: home.lng, location_text: 'Home' },
        { bases, profile: { workType: 'trades_field', travelEmphasis: true } }
      )
    ).toBe(false);
  });
});
