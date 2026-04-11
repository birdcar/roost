export interface RoostUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  organizationId: string | null;
  memberships: Array<{
    organizationId: string;
    role: string;
  }>;
}
