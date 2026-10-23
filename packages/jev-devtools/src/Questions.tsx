import {
  memo,
  useCallback,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  defaultRangeExtractor,
  measureElement,
  observeElementRect,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import { Answer, findImage, JsonBlock } from "./TraceContent.js";
import type { AnswerView, QuestionView, Trace } from "./protocol.js";

const QuestionContent = memo(function QuestionContent({
  name,
  question,
  answer,
  image,
  legendOpen,
  onLegendChange,
}: {
  name: string;
  question: QuestionView;
  answer?: AnswerView;
  image?: string;
  legendOpen: boolean;
  onLegendChange: (name: string, open: boolean) => void;
}) {
  return (
    <>
      <header>
        <h3>{name}</h3>
        <span className="type">{question.type}</span>
      </header>
      <JsonBlock value={question} />
      <Answer
        answer={answer}
        image={image}
        legendOpen={legendOpen}
        onLegendToggle={(open) => onLegendChange(name, open)}
      />
    </>
  );
});

/** Variable-height rows retain full answers; only offscreen DOM is omitted. */
export function Questions({ trace }: { trace: Trace }) {
  const helpId = useId();
  const entries = useMemo(
    () =>
      Object.entries(trace.request.questions ?? {}).filter(
        ([, q]) => q && typeof q === "object" && typeof q.type === "string",
      ),
    [trace.request.questions],
  );
  const image = useMemo(
    () => findImage(trace.request.state),
    [trace.request.state],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const sizes = useRef(new Map<string, number>());
  const pendingFocus = useRef<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [destination, setDestination] = useState(0);
  const [legends, setLegends] = useState(() => new Map<string, boolean>());
  const onLegendChange = useCallback((name: string, open: boolean) => {
    setLegends((previous) =>
      previous.get(name) === open
        ? previous
        : new Map(previous).set(name, open),
    );
  }, []);
  const getItemKey = useCallback(
    (index: number) => entries[index][0],
    [entries],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indices = defaultRangeExtractor(range);
      // Never remove a focused control when it scrolls outside the visible range.
      if (
        focused !== null &&
        focused < entries.length &&
        !indices.includes(focused)
      )
        indices.push(focused);
      return indices.sort((a, b) => a - b);
    },
    [focused, entries.length],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: entries.length,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: () => 600,
    overscan: 1,
    rangeExtractor,
    directDomUpdates: true,
    // A hidden drawer reports zero sizes. Retain its measurements and scroll
    // range instead of collapsing rows or resetting the reader's position.
    observeElementRect: (instance, callback) =>
      observeElementRect(instance, (rect) => {
        if (rect.width > 0 && rect.height > 0) callback(rect);
      }),
    measureElement: (element, entry, instance) => {
      const key = element.dataset.questionKey!;
      const height = measureElement(element, entry, instance);
      if (height > 0) sizes.current.set(key, height);
      return height || sizes.current.get(key) || 600;
    },
  });
  const items = virtualizer.getVirtualItems();
  const goTo = (index: number, focus = false) => {
    const next = Math.max(0, Math.min(entries.length - 1, index));
    setDestination(next);
    if (focus) {
      pendingFocus.current = next;
      setFocused(next);
    }
    virtualizer.scrollToIndex(next, { align: "start" });
  };
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const card = viewport.current?.querySelector<HTMLElement>(
      `[data-index="${pendingFocus.current}"] article`,
    );
    if (card) {
      card.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  });
  if (!entries.length)
    return <p className="muted">No questions available in this capture.</p>;
  return (
    <div className="questions-list">
      <div className="questions-navigation">
        <label>
          Jump to question
          <select
            aria-label="Jump to question"
            value={Math.min(destination, entries.length - 1)}
            onChange={(event) => goTo(Number(event.target.value))}
          >
            {entries.map(([name, q], index) => (
              <option key={name} value={index}>
                {index + 1}. {name} · {q.type}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="Previous question"
          disabled={destination === 0}
          onClick={() => goTo(destination - 1)}
        >
          Previous
        </button>
        <button
          aria-label="Next question"
          disabled={destination >= entries.length - 1}
          onClick={() => goTo(destination + 1)}
        >
          Next
        </button>
        <span>
          {entries.length} question{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="questions-help muted" id={helpId}>
        ↑ / ↓ previous / next · Home / End first / last when the list is
        focused.
      </p>
      <div
        className="questions-viewport"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Questions and answers"
        aria-describedby={helpId}
        onFocusCapture={(event) => {
          const row = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-index]",
          );
          if (row) {
            const index = Number(row.dataset.index);
            setFocused(index);
            setDestination(index);
          }
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocused(null);
        }}
        onKeyDown={(event) => {
          // Inputs, disclosures and scrollable JSON keep their native keys.
          if (
            event.target !== event.currentTarget &&
            !(event.target as HTMLElement).matches("article")
          )
            return;
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? entries.length - 1
                : event.key === "ArrowDown"
                  ? destination + 1
                  : event.key === "ArrowUp"
                    ? destination - 1
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            goTo(next, true);
          }
        }}
      >
        <div
          role="list"
          aria-label="Captured questions"
          className="questions-spacer"
          ref={virtualizer.containerRef}
        >
          {items.map((item) => {
            const [name, question] = entries[item.index];
            return (
              <div
                key={item.key}
                data-index={item.index}
                data-question-key={name}
                ref={virtualizer.measureElement}
                className="questions-row"
                role="listitem"
                aria-posinset={item.index + 1}
                aria-setsize={entries.length}
              >
                <article
                  className="question-node standalone"
                  tabIndex={-1}
                  aria-label={`Question ${item.index + 1}: ${name}`}
                >
                  <QuestionContent
                    name={name}
                    question={question}
                    answer={trace.result?.answers[name]}
                    image={image}
                    legendOpen={!!legends.get(name)}
                    onLegendChange={onLegendChange}
                  />
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
