// A Job is a persistent, lightweight container for one real-world piece of
// work that can span multiple days and hold multiple Tasks. It carries only
// optional context (client, location) — no dates, status, priority,
// estimates or lifecycle. Everything else about a Job is derived from its
// Tasks.
export type Job = {
  id: string;
  name: string;
  client: string | null;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};
