export const AVATARS = ['lion', 'owl', 'fox', 'bear', 'rabbit', 'turtle', 'whale', 'bee', 'cat', 'dog', 'frog', 'panda', 'koala', 'tiger', 'penguin', 'zebra'];

export function Avatar({ name = 'lion', label, small = false }) {
  const type = AVATARS.includes(name) ? name : 'lion';
  const color = `var(--avatar-${type})`;
  return <svg className={`avatar ${small ? 'small' : ''}`} viewBox="0 0 100 100" role={label ? 'img' : undefined}
    aria-label={label} aria-hidden={label ? undefined : true}>
    <circle cx="50" cy="50" r="49" fill="var(--navy-tint)" />
    {['bear', 'panda', 'koala', 'tiger'].includes(type) && <g fill={['panda', 'koala'].includes(type) ? 'var(--avatar-slate)' : color}>
      <circle cx="23" cy="27" r={type === 'koala' ? 18 : 12} /><circle cx="77" cy="27" r={type === 'koala' ? 18 : 12} />
    </g>}
    {type === 'lion' && <g><circle cx="50" cy="51" r="43" fill="var(--avatar-mane)" /><g fill={color}><circle cx="29" cy="30" r="8" /><circle cx="71" cy="30" r="8" /></g></g>}
    {type === 'dog' && <g fill="var(--avatar-ear)"><ellipse cx="21" cy="48" rx="12" ry="27" /><ellipse cx="79" cy="48" rx="12" ry="27" /></g>}
    {['fox', 'cat', 'owl'].includes(type) && <path d="M20 42 19 12 43 30 58 30 81 12 80 44Z" fill={color} />}
    {type === 'zebra' && <g fill={color}><path d="M24 40 20 7 35 12 43 37ZM76 40 80 7 65 12 57 37Z" /><path d="M47 28 46 9H54L53 28Z" fill="var(--avatar-stripe)" /></g>}
    {type === 'rabbit' && <g><g fill={color}><ellipse cx="34" cy="25" rx="12" ry="24" /><ellipse cx="66" cy="25" rx="12" ry="24" /></g><g fill="var(--avatar-inner-ear)"><ellipse cx="34" cy="22" rx="5" ry="16" /><ellipse cx="66" cy="22" rx="5" ry="16" /></g></g>}
    {type === 'turtle' && <g><g fill="var(--avatar-flipper)"><ellipse cx="24" cy="76" rx="13" ry="18" /><ellipse cx="76" cy="76" rx="13" ry="18" /></g><ellipse cx="50" cy="65" rx="42" ry="28" fill="var(--avatar-shell)" /><path d="M21 74 35 83 50 77 65 83 79 74" fill="none" stroke="var(--avatar-turtle)" strokeWidth="3" /></g>}
    {type === 'whale' && <g fill={color}><path d="M80 58Q99 44 98 65L83 76Z" /><path d="M46 24Q36 9 42 7Q49 8 50 22Q54 5 61 9Q65 15 54 24Z" /></g>}
    {type === 'bee' && <g><ellipse cx="25" cy="42" rx="18" ry="25" fill="var(--avatar-wing)" /><ellipse cx="75" cy="42" rx="18" ry="25" fill="var(--avatar-wing)" /><path d="M38 29 32 13M62 29 68 13" stroke="var(--avatar-feature)" strokeWidth="4" strokeLinecap="round" /></g>}
    {type === 'frog' && <g fill={color}><circle cx="29" cy="31" r="17" /><circle cx="71" cy="31" r="17" /></g>}
    {type === 'penguin' && <ellipse cx="50" cy="52" rx="36" ry="42" fill="var(--avatar-coat)" />}
    <ellipse cx="50" cy={type === 'turtle' ? 47 : 54} rx={type === 'bee' ? 25 : type === 'turtle' ? 26 : type === 'lion' ? 29 : 32} ry={type === 'penguin' ? 32 : type === 'turtle' ? 28 : 31} fill={color} />
    {['lion', 'tiger'].includes(type) && <ellipse cx="50" cy="65" rx="19" ry="13" fill="var(--avatar-muzzle)" />}
    {type === 'zebra' && <ellipse cx="50" cy="67" rx="24" ry="14" fill="var(--avatar-nose)" />}
    {type === 'fox' && <path d="M19 51 49 68 81 51 67 80H34Z" fill="var(--avatar-muzzle)" />}
    {type === 'owl' && <g fill="var(--avatar-eye-patch)"><ellipse cx="34" cy="47" rx="17" ry="19" /><ellipse cx="66" cy="47" rx="17" ry="19" /></g>}
    {type === 'panda' && <g fill="var(--avatar-feature)"><ellipse cx="34" cy="46" rx="12" ry="14" transform="rotate(22 34 46)" /><ellipse cx="66" cy="46" rx="12" ry="14" transform="rotate(-22 66 46)" /></g>}
    {type === 'dog' && <ellipse cx="30" cy="46" rx="14" ry="20" fill="var(--avatar-ear)" />}
    {type === 'bee' && <path d="M28 61H72M32 75H68" stroke="var(--avatar-bee-stripe)" strokeWidth="6" />}
    {['tiger', 'zebra'].includes(type) && <g stroke={type === 'zebra' ? 'var(--avatar-stripe)' : 'var(--avatar-tiger-stripe)'} strokeWidth="5" strokeLinecap="round"><path d="M39 25 42 35M61 25 58 35M22 54 30 57M78 54 70 57M23 66 31 68M77 66 69 68" /></g>}
    {type === 'frog' ? <g><g fill="var(--card)"><circle cx="29" cy="31" r="10" /><circle cx="71" cy="31" r="10" /></g><g fill="var(--deep-navy)"><circle cx="29" cy="31" r="4" /><circle cx="71" cy="31" r="4" /></g></g> :
      <g fill={type === 'panda' ? 'var(--card)' : 'var(--deep-navy)'}><circle cx="36" cy="48" r="3.8" /><circle cx="64" cy="48" r="3.8" /></g>}
    {['owl', 'penguin'].includes(type) ? <path d="m44 58 6 8 6-8Z" fill="var(--gold)" /> :
      ['frog', 'zebra'].includes(type) ? <g fill="var(--avatar-feature)"><circle cx="43" cy="60" r="2.5" /><circle cx="57" cy="60" r="2.5" /></g> :
      <ellipse cx="50" cy="60" rx={type === 'koala' ? 8 : 5} ry={type === 'koala' ? 11 : 4} fill="var(--avatar-feature)" />}
    <path d="M40 70Q50 78 60 70" fill="none" stroke="var(--avatar-feature)" strokeWidth="3" strokeLinecap="round" />
    {type === 'cat' && <path d="M19 61 32 63M18 68 31 67M81 61 68 63M82 68 69 67" stroke="var(--avatar-whisker)" strokeWidth="3" />}
  </svg>;
}
