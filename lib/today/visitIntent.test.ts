
import { describe, it, expect } from 'vitest';
import { classifyVisitIntent, isRouteStop } from './visitIntent';

const site = { lat: -41.3, lng: 174.8 };
const home = { lat: -41.28, lng: 174.77 };
const work = { lat: -41.29, lng: 174.78 };

describe('visitIntent', () => {
  it('does not treat job-inherited coords alone as a route stop', () => {
    expect(
      classifyVisitIntent({
        text: 'Send invoice for kitchen job',
        lat: site.lat,
        lng: site.lng,
        job_id: 'j1',
      })
    ).toBe('context_only');
  });

  it('marks clear on-site language as must_visit', () => {
    expect(
      classifyVisitIntent({
        text: 'On-site measure up at the property',
        lat: site.lat,
        lng: site.lng,
      })
    ).toBe('must_visit');
  });

  it('treats remote-work language as context even with coords', () => {
    expect(
      classifyVisitIntent({
        text: 'Call client about quote',
        lat: site.lat,
        lng: site.lng,
      })
    ).toBe('context_only');
  });

  it('excludes home/work pin as a stop', () => {
    expect(
      isRouteStop(
        { text: 'Sort paperwork', lat: home.lat, lng: home.lng },
        { home, work }
      )
    ).toBe(false);
  });

  it('honours explicit requires_visit', () => {
    expect(
      classifyVisitIntent({
        text: 'Kitchen follow-up',
        lat: site.lat,
        lng: site.lng,
        requires_visit: true,
      })
    ).toBe('must_visit');
  });
});
