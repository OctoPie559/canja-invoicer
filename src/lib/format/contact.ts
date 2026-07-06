/** Display name for a contact person — plain module, usable on both
 *  server and client (a "use client" export cannot be called on the server). */
export function contactDisplayName(contact: {
  salutation?: string | null;
  firstName: string;
  lastName?: string | null;
}): string {
  return [contact.salutation, contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
}
