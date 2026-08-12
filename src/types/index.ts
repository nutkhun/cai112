export type Section = '457A' | '458A' | '458B';

export const SECTIONS: Section[] = ['457A', '458A', '458B'];

export interface Student {
  id: string;
  name: string;
  studentId: string;
  section: Section;
  groupId?: string;
  indexNumber?: number;
}

export interface Group {
  id: string;
  name: string;
  members: Student[];
  createdBy: string;
  leaderId?: string;
}

export type ViewMode = 'student' | 'teacher';
