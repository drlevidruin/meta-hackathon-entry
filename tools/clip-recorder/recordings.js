import { constants } from 'node:fs';
import { mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isClipName } from './clips.js';

export const PRIVATE_DIRECTORY = fileURLToPath(new URL('../../recordings/private/', import.meta.url));
export const MAX_BYTES = 10 * 1024 * 1024;

// The directory override is for isolated offline tests, never a CLI option.
export function recordingStore(clips, directory = PRIVATE_DIRECTORY) {
  directory = resolve(directory);

  async function checkedDirectory(create = false) {
    if (create) {
      if (await realpath(dirname(directory)) !== dirname(directory)) {
        throw new Error('Recording directories must not use symbolic links.');
      }
      await mkdir(directory, { recursive: false, mode: 0o700 }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }
    if (await realpath(directory) !== directory) {
      throw new Error('Recording directories must not use symbolic links.');
    }
    return directory;
  }

  function filename(name) {
    if (!isClipName(name, clips)) throw new Error('Invalid clip name.');
    return join(directory, `${name}.wav`);
  }

  async function entries() {
    try {
      return await readdir(await checkedDirectory(), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  return {
    async list() {
      const names = new Set((await entries()).filter((entry) => entry.isFile()).map((entry) => entry.name));
      return clips.map((clip) => ({ ...clip, done: names.has(`${clip.name}.wav`) }));
    },

    async save(name, data) {
      const target = filename(name);
      if (data.length > MAX_BYTES) throw new Error('Recording exceeds the 10 MB limit.');
      await checkedDirectory(true);
      const temporary = join(directory, `.clip-${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(data);
        } finally {
          await file.close();
        }
        // Replacing the directory entry never follows a pre-existing symlink.
        await rename(temporary, target);
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    },

    async read(name) {
      const path = filename(name);
      await checkedDirectory();
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid recording.');
        return await file.readFile();
      } finally {
        await file.close();
      }
    },

    async remove(name) {
      const path = filename(name);
      try {
        await checkedDirectory();
        await unlink(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },

    async deleteChildren() {
      const deleted = [];
      for (const entry of await entries()) {
        if (entry.name.startsWith('child_') && entry.name.endsWith('.wav')
          && (entry.isFile() || entry.isSymbolicLink())) {
          await unlink(join(directory, entry.name));
          deleted.push(entry.name);
        }
      }
      return deleted;
    },
  };
}
