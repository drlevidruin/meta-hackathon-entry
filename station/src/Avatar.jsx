export const AVATARS = ['lion', 'owl', 'fox', 'bear', 'rabbit', 'turtle', 'whale', 'bee', 'cat', 'dog', 'frog', 'panda', 'koala', 'tiger', 'penguin', 'zebra'];
const colors = { lion: '#edbc55', owl: '#b6a2cc', fox: '#df985a', bear: '#b99579', rabbit: '#d8c4de', turtle: '#8fbea0', whale: '#8bb8cd', bee: '#f2cf61', cat: '#c5aadd', dog: '#ceaa82', frog: '#9bc284', panda: '#f0f1ee', koala: '#b3bdc7', tiger: '#eab16b', penguin: '#b7c8d0', zebra: '#eff0eb' };

export function Avatar({ name = 'lion', label, small = false }) {
  const type = AVATARS.includes(name) ? name : 'lion';
  const color = colors[type];
  return <svg className={`avatar ${small ? 'small' : ''}`} viewBox="0 0 100 100" role={label ? 'img' : undefined}
    aria-label={label} aria-hidden={label ? undefined : true}>
    <circle cx="50" cy="50" r="49" fill="#f4f6f2" />
    {type === 'lion' && <circle cx="50" cy="52" r="39" fill="#c89045" />}
    {['bear', 'panda', 'koala', 'dog', 'tiger', 'lion'].includes(type) && <g fill={['panda', 'koala'].includes(type) ? '#73828c' : color}>
      <circle cx="23" cy="27" r={type === 'koala' ? 18 : 12} /><circle cx="77" cy="27" r={type === 'koala' ? 18 : 12} />
    </g>}
    {['fox', 'cat', 'owl', 'zebra'].includes(type) && <path d="M20 42 19 12 43 30 58 30 81 12 80 44Z" fill={color} />}
    {type === 'rabbit' && <g fill={color}><ellipse cx="34" cy="25" rx="12" ry="24" /><ellipse cx="66" cy="25" rx="12" ry="24" /></g>}
    {type === 'turtle' && <g fill="#639274"><ellipse cx="24" cy="70" rx="13" ry="18" /><ellipse cx="76" cy="70" rx="13" ry="18" /></g>}
    {type === 'whale' && <g fill={color}><path d="M80 58Q99 44 98 65L83 76Z" /><path d="M46 24Q36 9 42 7Q49 8 50 22Q54 5 61 9Q65 15 54 24Z" /></g>}
    {type === 'bee' && <g><ellipse cx="25" cy="42" rx="18" ry="25" fill="#dbeaf0" /><ellipse cx="75" cy="42" rx="18" ry="25" fill="#dbeaf0" /><path d="M38 29 32 13M62 29 68 13" stroke="#526467" strokeWidth="4" strokeLinecap="round" /></g>}
    {type === 'frog' && <g fill={color}><circle cx="29" cy="31" r="17" /><circle cx="71" cy="31" r="17" /></g>}
    {type === 'penguin' && <ellipse cx="50" cy="52" rx="36" ry="42" fill="#536a74" />}
    <ellipse cx="50" cy="54" rx={type === 'bee' ? 25 : 32} ry={type === 'penguin' ? 32 : 31} fill={color} />
    {type === 'fox' && <path d="M19 51 49 68 81 51 67 80H34Z" fill="#fff3da" />}
    {type === 'owl' && <g fill="#f7eedc"><ellipse cx="34" cy="47" rx="17" ry="19" /><ellipse cx="66" cy="47" rx="17" ry="19" /></g>}
    {type === 'panda' && <g fill="#526467"><ellipse cx="34" cy="46" rx="12" ry="14" transform="rotate(22 34 46)" /><ellipse cx="66" cy="46" rx="12" ry="14" transform="rotate(-22 66 46)" /></g>}
    {type === 'dog' && <ellipse cx="30" cy="46" rx="14" ry="20" fill="#9d7a58" />}
    {type === 'bee' && <path d="M28 61H72M32 75H68" stroke="#7c6b41" strokeWidth="6" />}
    {['tiger', 'zebra'].includes(type) && <g stroke={type === 'zebra' ? '#627078' : '#9f7040'} strokeWidth="5" strokeLinecap="round"><path d="M39 25 42 35M61 25 58 35M22 54 30 57M78 54 70 57M23 66 31 68M77 66 69 68" /></g>}
    <g fill={type === 'panda' ? '#ffffff' : '#1b2a2f'}><circle cx="36" cy="48" r="3.8" /><circle cx="64" cy="48" r="3.8" /></g>
    {['owl', 'penguin'].includes(type) ? <path d="m44 58 6 8 6-8Z" fill="#dfa63a" /> :
      <ellipse cx="50" cy="60" rx={type === 'koala' ? 8 : 5} ry={type === 'koala' ? 11 : 4} fill="#526467" />}
    <path d="M40 70Q50 78 60 70" fill="none" stroke="#526467" strokeWidth="3" strokeLinecap="round" />
    {type === 'cat' && <path d="M19 61 32 63M18 68 31 67M81 61 68 63M82 68 69 67" stroke="#786087" strokeWidth="2" />}
  </svg>;
}
