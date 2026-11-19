import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export const SuggestionList = forwardRef(function SuggestionList({ items, command }, ref) {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  useEffect(() => setIndex(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const select = (i) => {
    const item = items[i];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === 'ArrowUp') { setIndex((i) => (i + items.length - 1) % items.length); return true; }
      if (event.key === 'ArrowDown') { setIndex((i) => (i + 1) % items.length); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { select(index); return true; }
      return false;
    },
  }));

  if (!items.length) return <div className="suggest-list"><div className="suggest-empty">No results</div></div>;

  return (
    <div className="suggest-list" ref={listRef}>
      {items.map((item, i) => (
        <button
          key={item.title + i}
          data-i={i}
          className={`suggest-item${i === index ? ' active' : ''}`}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => { e.preventDefault(); select(i); }}
        >
          <span className="suggest-icon">{item.icon}</span>
          <span className="suggest-text">
            <span className="suggest-title">{item.title}</span>
            {item.desc && <span className="suggest-desc">{item.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  );
});
