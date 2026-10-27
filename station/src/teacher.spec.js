import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App.jsx';
import { Avatar, AVATARS } from './Avatar.jsx';
import { ClassView, ChildDetail, Packet, Roster } from './Teacher.jsx';
import * as api from './api.js';
import { loadPin, savePin } from './storage.js';

beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, '', '/?mock#/teacher'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires a checked PIN and keeps it in session storage', async () => {
  const check = vi.spyOn(api, 'checkPin');
  render(React.createElement(App));
  expect(screen.getByRole('heading', { name: 'Teacher PIN' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Class' })).toBeNull();
  for (const digit of ['1', '2', '3', '4']) fireEvent.click(screen.getByRole('button', { name: digit }));
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
  expect(await screen.findByRole('heading', { name: 'Class' })).toBeTruthy();
  expect(check).toHaveBeenCalledWith('1234'); expect(loadPin()).toBe('1234');
  fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
  expect(screen.getByRole('heading', { name: 'Teacher PIN' })).toBeTruthy(); expect(loadPin()).toBe('');
});

it('renders groups before children and opens a skill packet', async () => {
  render(React.createElement(ClassView));
  const groups = await screen.findByRole('heading', { name: 'Practice groups' });
  expect(groups.compareDocumentPosition(screen.getByRole('heading', { name: 'Children' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(groups.parentElement).getByRole('link', { name: /Sheva/ }).getAttribute('href')).toBe('#/teacher/packet/skill/vowel%3Asheva_na/1');
  expect(screen.getAllByText('18 of 20 sounds')).toHaveLength(3);
  expect(screen.getByRole('img', { name: 'Bim' })).toBeTruthy();
});

it('renders map samples in all three states, turn logs, parent line and copy', async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(React.createElement(ChildDetail, { childId: 'bim' }));
  expect(await screen.findByRole('heading', { name: 'Reading map' })).toBeTruthy();
  for (const state of ['solid', 'shaky', 'untested']) {
    expect(document.querySelectorAll(`td.${state}`)).toHaveLength(3);
    expect(document.querySelector(`td.${state} span`).getAttribute('lang')).toBe('he');
  }
  expect(screen.getByRole('list', { name: 'Map legend' }).children).toHaveLength(3);
  expect(screen.getByText('Practiced sheva after two missed sounds.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Bim'));
});

it('prints a packet with all three sections and no helper lines', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  render(React.createElement(Packet, { childId: 'bim' }));
  expect(await screen.findByRole('heading', { name: 'Warm up' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Practice' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Challenge' })).toBeTruthy();
  expect(document.querySelectorAll('.packet-grid [lang="he"]')).toHaveLength(9);
  fireEvent.click(screen.getByRole('button', { name: 'Print' })); expect(print).toHaveBeenCalledOnce();
});

it('asks before deleting and names the child in the confirmation', async () => {
  const remove = vi.spyOn(api, 'deleteChild');
  render(React.createElement(Roster));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Bim' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Delete Bim?' });
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).toBeNull(); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Bim' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete Bim' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Bim' })).toBeNull());
  expect(remove).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith('bim');
});

it('adds and edits the child avatar, preset, and level', async () => {
  render(React.createElement(Roster));
  await screen.findByRole('button', { name: 'Edit Bim' });
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Mippo' } });
  fireEvent.click(screen.getByRole('button', { name: 'whale' }));
  fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'ashkenazi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Mippo' }));
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect((await api.children()).find(child => child.name === 'Mippo')).toMatchObject({ avatar: 'whale', preset: 'ashkenazi', level: 3 }));
});

it.each(['#/teacher/child/bim', '#/teacher/roster', '#/teacher/packet/child/bim', '#/teacher/packet/skill/vowel%3Asheva_na/1', '#/trace/mock-turn'])
  ('opens protected mock bookmark %s without a server', async hash => {
    window.history.replaceState(null, '', `/?mock${hash}`); savePin('1234');
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(React.createElement(App));
    const expected = hash.includes('/packet/') ? 'Warm up' : hash.includes('/roster') ? 'Roster' : hash.includes('/trace/') ? 'Coach trace' : 'Reading map';
    expect(await screen.findByRole('heading', { name: expected })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

it('redirects a trace bookmark home when trace is off', async () => {
  window.history.replaceState(null, '', '/?mock#/trace/turn-1');
  vi.spyOn(api, 'config').mockResolvedValue({ trace: false });
  const trace = vi.spyOn(api, 'trace');
  render(React.createElement(App));
  expect(await screen.findByRole('heading', { name: 'Who’s reading?' })).toBeTruthy();
  expect(window.location.hash).toBe('#/'); expect(trace).not.toHaveBeenCalled();
});

it('opens child and done mock bookmarks without a server', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  window.history.replaceState(null, '', '/?mock#/child/bim');
  const view = render(React.createElement(App));
  expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
  expect(screen.getByText('Lifetime stars')).toBeTruthy(); expect(screen.getByText('Best turn')).toBeTruthy();
  view.unmount(); window.history.replaceState(null, '', '/?mock#/done');
  render(React.createElement(App));
  expect(await screen.findByRole('button', { name: 'Next friend' })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

it('provides a distinct inline SVG for every allowed avatar', () => {
  const shapes = AVATARS.map(name => {
    const view = render(React.createElement(Avatar, { name, label: name }));
    const svg = screen.getByRole('img', { name });
    const shape = svg.innerHTML;
    view.unmount(); return shape;
  });
  expect(new Set(shapes).size).toBe(16);
});
