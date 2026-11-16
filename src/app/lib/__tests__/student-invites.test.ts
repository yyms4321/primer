import { createStudentInvite, verifyStudentInvite } from '../student-invites';

describe('signed student invitations', () => {
  const oldSecret = process.env.STUDENT_INVITE_SECRET;
  const time = 1_800_000_000;

  beforeEach(() => {
    process.env.STUDENT_INVITE_SECRET = 'long-test-only-key-do-not-use-in-production-1234';
  });

  afterAll(() => {
    if (oldSecret === undefined) delete process.env.STUDENT_INVITE_SECRET;
    else process.env.STUDENT_INVITE_SECRET = oldSecret;
  });

  it('accepts only an unexpired invite for its exact experience', () => {
    const ticket = createStudentInvite('science_class-1', 3600, time);
    expect(verifyStudentInvite(ticket, time + 1)).toEqual({
      experienceId: 'science_class-1',
      expiresAt: time + 3600,
    });
    expect(verifyStudentInvite(ticket, time + 3600)).toBeNull();
  });

  it('rejects modifications and unrelated tokens', () => {
    const ticket = createStudentInvite('science_class-1', 3600, time);
    const parts = ticket.split('.');
    const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + 'AB'].join('.');
    expect(verifyStudentInvite(tampered, time)).toBeNull();
    expect(verifyStudentInvite('not-a-ticket', time)).toBeNull();
  });

  it('rejects traversal and unbounded lifetimes', () => {
    expect(() => createStudentInvite('../teacher')).toThrow();
    expect(() => createStudentInvite('science', 999999)).toThrow();
  });

  it('requires a separate high entropy secret', () => {
    delete process.env.STUDENT_INVITE_SECRET;
    expect(() => createStudentInvite('science')).toThrow(/STUDENT_INVITE_SECRET/);
  });
});
