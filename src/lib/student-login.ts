import type { Section } from '@/types';

export function readStudentLogin(form: FormData) {
  const read = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const name = read('lastName');
  const studentId = read('studentId');
  const section = read('section');
  const pin = read('pin');
  if (!name || !studentId) return { error: 'Please enter your last name and student ID.' } as const;
  if (!['457A', '458A', '458B'].includes(section)) return { error: 'Please select your section.' } as const;
  if (!/^\d{4}$/.test(pin)) return { error: 'Please enter your current 4-digit PIN.' } as const;
  return { name, studentId, section: section as Section, pin };
}
