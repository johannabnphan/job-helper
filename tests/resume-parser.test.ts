import { describe, expect, it } from 'vitest';
import { applyParsedResume, parseResumeText } from '../src/shared/resume-parser';
import { emptyProfile } from '../src/shared/defaults';

// Fictional sample resume.
const SAMPLE = `Alex Rivera
Brooklyn, NY | alex.rivera@example.com | (555) 123-4567
linkedin.com/in/alexrivera | github.com/arivera | alexrivera.dev

SUMMARY
Product designer who also writes code.

EXPERIENCE
Senior Product Designer, Northwind Labs    Jan 2021 – Present
• Led the redesign of the onboarding flow, lifting activation 18%
• Built a design system used by 6 product teams
Contoso Media | New York, NY
Product Designer    06/2018 - 12/2020
• Shipped the mobile reader app

EDUCATION
Rhode Island School of Design
BFA in Graphic Design, 2018
GPA: 3.8/4.0

SKILLS
Design: Figma, Prototyping, User research
Code: TypeScript, React, CSS
`;

describe('parseResumeText', () => {
  const r = parseResumeText(SAMPLE);

  it('extracts contact info', () => {
    expect(r.firstName).toBe('Alex');
    expect(r.lastName).toBe('Rivera');
    expect(r.email).toBe('alex.rivera@example.com');
    expect(r.phone).toBe('(555) 123-4567');
    expect(r.city).toBe('Brooklyn');
    expect(r.state).toBe('NY');
  });

  it('extracts links', () => {
    expect(r.linkedin).toBe('https://linkedin.com/in/alexrivera');
    expect(r.github).toBe('https://github.com/arivera');
    expect(r.portfolio).toBe('https://alexrivera.dev');
  });

  it('extracts work history', () => {
    expect(r.work).toHaveLength(2);
    expect(r.work[0]).toMatchObject({
      title: 'Senior Product Designer',
      company: 'Northwind Labs',
      startDate: 'Jan 2021',
      current: true,
    });
    expect(r.work[0].description).toContain('design system');
    expect(r.work[1]).toMatchObject({
      title: 'Product Designer',
      company: 'Contoso Media',
      location: 'New York, NY',
      startDate: '06/2018',
      endDate: '12/2020',
      current: false,
    });
  });

  it('extracts education', () => {
    expect(r.education).toHaveLength(1);
    expect(r.education[0]).toMatchObject({
      school: 'Rhode Island School of Design',
      degree: 'BFA',
      field: 'Graphic Design',
      endDate: '2018',
      gpa: '3.8/4.0',
    });
  });

  it('extracts skills without category labels', () => {
    expect(r.skills).toEqual(['Figma', 'Prototyping', 'User research', 'TypeScript', 'React', 'CSS']);
  });
});

describe('applyParsedResume', () => {
  it('fills the profile and reports changed paths', () => {
    const { profile, changed } = applyParsedResume(emptyProfile(), parseResumeText(SAMPLE));
    expect(profile.firstName).toBe('Alex');
    expect(profile.address.city).toBe('Brooklyn');
    expect(changed).toContain('work');
    expect(changed).toContain('links.linkedin');
  });
});
