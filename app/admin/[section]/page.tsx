'use client';

import { useParams } from 'next/navigation';
import NotYetImplemented from '@/components/admin/NotYetImplemented';
import { findAdminSection } from '@/components/admin/nav';

// Fallback route for Admin sections without a real page yet. Static
// routes (overview, users, feedback, errors) always win over this dynamic
// catch-all, so a future page is added simply by creating its own folder
// (e.g. app/admin/stripe/page.tsx) and deleting nothing.
export default function AdminSectionPage() {
  const params = useParams<{ section: string }>();
  const slug = typeof params.section === 'string' ? params.section : 'overview';
  const section = findAdminSection(slug);

  if (!section) {
    return (
      <NotYetImplemented
        title="Unknown section"
        description="This Admin path is not recognised."
      />
    );
  }

  return (
    <NotYetImplemented
      title={section.item.title}
      group={section.group}
      description={section.item.description}
    />
  );
}