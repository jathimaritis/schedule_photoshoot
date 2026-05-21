export type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type ShotStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';
export type FieldGroup = 'CREW' | 'CLIENT' | 'LOGISTICS';

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  agencyName?: string | null;
  footerText?: string | null;
  defaultCrewFields?: FieldTemplate[] | null;
  defaultClientFields?: FieldTemplate[] | null;
  defaultLogisticsFields?: FieldTemplate[] | null;
  createdAt: string;
}

export interface FieldTemplate {
  label: string;
  value?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  organisationId: string;
  organisation?: Organisation;
}

export interface InviteToken {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientName?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
  agencyName?: string | null;
  footerText?: string | null;
  organisationId: string;
  createdById: string;
  createdBy?: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  createdAt: string;
  updatedAt: string;
  photographyTypes?: PhotographyType[];
  shootingDays?: ShootingDay[];
  _count?: { shootingDays: number; shots: number; callSheets: number };
}

export interface PhotographyType {
  id: string;
  name: string;
  hexColour: string;
  sortOrder: number;
  projectId: string;
}

export interface ShootingDay {
  id: string;
  dayNumber: number;
  calendarDate: string;
  label?: string | null;
  projectId: string;
  photographyTypeId?: string | null;
  photographyType?: PhotographyType | null;
  callSheet?: { id: string; isLocked: boolean } | null;
}

export interface ShotSection {
  id: string;
  name: string;
  sortOrder: number;
  projectId: string;
  categories: ShotCategory[];
}

export interface ShotCategory {
  id: string;
  name: string;
  sortOrder: number;
  isVisible: boolean;
  sectionId: string;
  projectId: string;
  photographyTypeId?: string | null;
  photographyType?: PhotographyType | null;
  locations: ShotLocation[];
}

export interface ShotLocation {
  id: string;
  name: string;
  sortOrder: number;
  isVisible: boolean;
  categoryId: string;
  projectId: string;
  shots: Shot[];
}

export interface Shot {
  id: string;
  description: string;
  timing?: string | null;
  notes?: string | null;
  sortOrder: number;
  isVisible: boolean;
  status: ShotStatus;
  tickColourOverride?: string | null;
  locationId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  dayAssignments?: ShotDayAssignment[];
}

export interface ShotDayAssignment {
  id: string;
  shotId: string;
  shootingDayId: string;
  tickColour?: string | null;
  shootingDay?: ShootingDay;
}

export interface CallSheet {
  id: string;
  notes?: string | null;
  isLocked: boolean;
  shootingDayId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  fields: CallSheetField[];
  shots: CallSheetShot[];
  shootingDay?: ShootingDay;
}

export interface CallSheetField {
  id: string;
  label: string;
  value?: string | null;
  isVisible: boolean;
  sortOrder: number;
  fieldGroup: FieldGroup;
  callSheetId: string;
}

export interface CallSheetShot {
  id: string;
  sortOrder: number;
  statusOverride?: ShotStatus | null;
  callSheetId: string;
  shotId: string;
  shot: Shot & { location?: ShotLocation & { category?: ShotCategory } };
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
