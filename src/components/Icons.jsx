import React from 'react';

const S = (props) => <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props} />;

export const Icon = {
  chevron: (p) => <S {...p} width="12" height="12"><path d="M7 5l5 5-5 5" /></S>,
  page: (p) => <S {...p}><path d="M5.5 2.5h6l3.5 3.5v11a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-14a.5.5 0 0 1 .5-.5z" /><path d="M11.5 2.5V6h3.5" /><path d="M7.5 10h5M7.5 13h5" /></S>,
  folder: (p) => <S {...p}><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h7.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /></S>,
  folderOpen: (p) => <S {...p}><path d="M2.5 15.5v-10a1 1 0 0 1 1-1h4l1.5 1.5h6.5a1 1 0 0 1 1 1v1.5" /><path d="M2.5 15.5l2.2-6.3a1 1 0 0 1 .95-.7h11.6a.6.6 0 0 1 .57.8l-2 5.5a1 1 0 0 1-.94.7z" /></S>,
  plus: (p) => <S {...p}><path d="M10 4v12M4 10h12" /></S>,
  dots: (p) => <S {...p}><circle cx="4.5" cy="10" r=".9" fill="currentColor" /><circle cx="10" cy="10" r=".9" fill="currentColor" /><circle cx="15.5" cy="10" r=".9" fill="currentColor" /></S>,
  search: (p) => <S {...p}><circle cx="8.5" cy="8.5" r="5" /><path d="M12.5 12.5l4 4" /></S>,
  compose: (p) => <S {...p}><path d="M15.5 3.5l1 1a1.4 1.4 0 0 1 0 2l-7 7-3 1 1-3 7-7a1.4 1.4 0 0 1 2 0z" /><path d="M9 4H4.5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1H15a1 1 0 0 0 1-1V11" /></S>,
  sidebar: (p) => <S {...p}><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M7.5 3.5v13" /></S>,
  sun: (p) => <S {...p}><circle cx="10" cy="10" r="3.5" /><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4" /></S>,
  vault: (p) => <S {...p}><rect x="3" y="3" width="14" height="14" rx="3" /><path d="M7 7h6M7 10h6M7 13h3" /></S>,
  newFolder: (p) => <S {...p}><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h7.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" /><path d="M10 9v5M7.5 11.5h5" /></S>,
  trash: (p) => <S {...p}><path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L15 5.5" /></S>,
  edit: (p) => <S {...p}><path d="M13.5 3.5l3 3-9 9H4.5v-3z" /></S>,
  reveal: (p) => <S {...p}><path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8" /></S>,
  code: (p) => <S {...p}><path d="M7 6.5L3.5 10 7 13.5M13 6.5l3.5 3.5-3.5 3.5M11 4.5l-2 11" /></S>,
  eye: (p) => <S {...p}><path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5-8-5.5-8-5.5z" /><circle cx="10" cy="10" r="2.5" /></S>,
  spellcheck: (p) => <S {...p}><path d="M3.5 12L7 4l3.5 8M4.7 9.5h4.6" /><path d="M11.5 13.5l2 2 4-4.5" /></S>,
};
