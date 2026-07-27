"use client";

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DndContextProps,
  type DragCancelEvent,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  DragOverlay,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  type ScreenReaderInstructions,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  type SortableContextProps,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as React from "react";
import * as ReactDOM from "react-dom";

// Adapted from Dice UI's MIT-licensed shadcn registry component.
// https://diceui.com/docs/components/radix/sortable

const ROOT_NAME = "Sortable";
const CONTENT_NAME = "SortableContent";
const ITEM_NAME = "SortableItem";
const ITEM_HANDLE_NAME = "SortableItemHandle";
const OVERLAY_NAME = "SortableOverlay";

interface SortableRootContextValue<T> {
  id: string;
  items: UniqueIdentifier[];
  modifiers: DndContextProps["modifiers"];
  strategy: SortableContextProps["strategy"];
  activeId: UniqueIdentifier | null;
  getItemValue: (item: T) => UniqueIdentifier;
}

const SortableRootContext =
  React.createContext<SortableRootContextValue<unknown> | null>(null);

function useSortableContext(consumerName: string) {
  const context = React.useContext(SortableRootContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

interface GetItemValue<T> {
  getItemValue: (item: T) => UniqueIdentifier;
}

type SortableProps<T> = DndContextProps &
  (T extends object ? GetItemValue<T> : Partial<GetItemValue<T>>) & {
    value: T[];
    onValueChange?: (items: T[]) => void;
    onMove?: (
      event: DragEndEvent & { activeIndex: number; overIndex: number },
    ) => void;
    strategy?: SortableContextProps["strategy"];
  };

function Sortable<T>(props: SortableProps<T>) {
  const {
    value,
    onValueChange,
    collisionDetection,
    modifiers,
    strategy,
    onMove,
    getItemValue: getItemValueProp,
    accessibility,
    onDragStart: onDragStartProp,
    onDragEnd: onDragEndProp,
    onDragCancel: onDragCancelProp,
    ...sortableProps
  } = props;

  const id = React.useId();
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const getItemValue = React.useCallback(
    (item: T): UniqueIdentifier => {
      if (typeof item === "object" && !getItemValueProp) {
        throw new Error(
          "`getItemValue` is required when using an array of objects",
        );
      }
      return getItemValueProp
        ? getItemValueProp(item)
        : (item as UniqueIdentifier);
    },
    [getItemValueProp],
  );

  const items = React.useMemo(
    () => value.map((item) => getItemValue(item)),
    [getItemValue, value],
  );

  const handleDragStart = React.useCallback(
    (event: Parameters<NonNullable<DndContextProps["onDragStart"]>>[0]) => {
      onDragStartProp?.(event);
      if (!event.activatorEvent.defaultPrevented) setActiveId(event.active.id);
    },
    [onDragStartProp],
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      onDragEndProp?.(event);
      if (event.activatorEvent.defaultPrevented) return;

      const { active, over } = event;
      if (over && active.id !== over.id) {
        const activeIndex = value.findIndex(
          (item) => getItemValue(item) === active.id,
        );
        const overIndex = value.findIndex(
          (item) => getItemValue(item) === over.id,
        );
        if (activeIndex !== -1 && overIndex !== -1) {
          if (onMove) {
            onMove({ ...event, activeIndex, overIndex });
          } else {
            onValueChange?.(arrayMove(value, activeIndex, overIndex));
          }
        }
      }
      setActiveId(null);
    },
    [
      getItemValue,
      onMove,
      onValueChange,
      onDragEndProp,
      value,
    ],
  );

  const handleDragCancel = React.useCallback(
    (event: DragCancelEvent) => {
      onDragCancelProp?.(event);
      if (!event.activatorEvent.defaultPrevented) setActiveId(null);
    },
    [onDragCancelProp],
  );

  const announcements: Announcements = React.useMemo(
    () => ({
      onDragStart({ active }) {
        const currentIndex = active.data.current?.sortable.index ?? 0;
        return `Picked up sortable item ${active.id}. Position ${currentIndex + 1} of ${value.length}. Use the up and down arrow keys to move, then press space or enter to drop.`;
      },
      onDragOver({ active, over }) {
        if (!over) {
          return "The sortable item is no longer over the list. Press escape to cancel.";
        }
        const overIndex = over.data.current?.sortable.index ?? 0;
        return `Sortable item ${active.id} moved to position ${overIndex + 1} of ${value.length}.`;
      },
      onDragEnd({ active, over }) {
        if (!over) {
          return `Sortable item ${active.id} was dropped outside the list. No changes were made.`;
        }
        const overIndex = over.data.current?.sortable.index ?? 0;
        return `Sortable item ${active.id} was dropped at position ${overIndex + 1} of ${value.length}.`;
      },
      onDragCancel({ active }) {
        const activeIndex = active.data.current?.sortable.index ?? 0;
        return `Sorting cancelled. Sortable item ${active.id} returned to position ${activeIndex + 1} of ${value.length}.`;
      },
    }),
    [value.length],
  );

  const screenReaderInstructions: ScreenReaderInstructions = React.useMemo(
    () => ({
      draggable:
        "To pick up a sortable item, press space or enter. While dragging, use the up and down arrow keys to move it. Press space or enter again to drop it, or press escape to cancel.",
    }),
    [],
  );

  const contextValue = React.useMemo(
    () => ({
      id,
      items,
      modifiers:
        modifiers ?? [restrictToVerticalAxis, restrictToParentElement],
      strategy: strategy ?? verticalListSortingStrategy,
      activeId,
      getItemValue,
    }),
    [activeId, getItemValue, id, items, modifiers, strategy],
  );

  return (
    <SortableRootContext.Provider
      value={contextValue as SortableRootContextValue<unknown>}
    >
      <DndContext
        collisionDetection={collisionDetection ?? closestCenter}
        modifiers={contextValue.modifiers}
        sensors={sensors}
        {...sortableProps}
        id={id}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions,
          ...accessibility,
        }}
      />
    </SortableRootContext.Provider>
  );
}

const SortableContentContext = React.createContext(false);

interface SortableContentProps extends React.ComponentProps<"div"> {
  strategy?: SortableContextProps["strategy"];
  children: React.ReactNode;
}

function SortableContent({
  strategy,
  children,
  ...contentProps
}: SortableContentProps) {
  const context = useSortableContext(CONTENT_NAME);
  return (
    <SortableContentContext.Provider value>
      <SortableContext
        items={context.items}
        strategy={strategy ?? context.strategy}
      >
        <div data-slot="sortable-content" {...contentProps}>
          {children}
        </div>
      </SortableContext>
    </SortableContentContext.Provider>
  );
}

interface SortableItemContextValue {
  id: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners | undefined;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  isDragging: boolean;
  disabled: boolean;
}

const SortableItemContext =
  React.createContext<SortableItemContextValue | null>(null);

function useSortableItemContext(consumerName: string) {
  const context = React.useContext(SortableItemContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ITEM_NAME}\``);
  }
  return context;
}

const SortableOverlayContext = React.createContext(false);

interface SortableItemProps extends React.ComponentProps<"div"> {
  value: UniqueIdentifier;
  disabled?: boolean;
}

function SortableItem({
  value,
  style,
  disabled = false,
  ref,
  ...itemProps
}: SortableItemProps) {
  const inSortableContent = React.useContext(SortableContentContext);
  const inSortableOverlay = React.useContext(SortableOverlayContext);
  if (!inSortableContent && !inSortableOverlay) {
    throw new Error(
      `\`${ITEM_NAME}\` must be used within \`${CONTENT_NAME}\` or \`${OVERLAY_NAME}\``,
    );
  }
  if (value === "") {
    throw new Error(`\`${ITEM_NAME}\` value cannot be an empty string`);
  }

  const id = React.useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: value, disabled });

  const setComposedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref, setNodeRef],
  );

  const itemContext = React.useMemo(
    () => ({
      id,
      attributes,
      listeners,
      setActivatorNodeRef,
      isDragging,
      disabled,
    }),
    [
      attributes,
      disabled,
      id,
      isDragging,
      listeners,
      setActivatorNodeRef,
    ],
  );

  return (
    <SortableItemContext.Provider value={itemContext}>
      <div
        id={id}
        data-disabled={disabled ? "" : undefined}
        data-dragging={isDragging ? "" : undefined}
        data-slot="sortable-item"
        {...itemProps}
        ref={setComposedRef}
        style={{
          transform: CSS.Translate.toString(transform),
          transition,
          ...style,
        }}
      />
    </SortableItemContext.Provider>
  );
}

type SortableItemHandleProps = React.ComponentProps<"button">;

function SortableItemHandle({
  disabled,
  ref,
  ...itemHandleProps
}: SortableItemHandleProps) {
  const itemContext = useSortableItemContext(ITEM_HANDLE_NAME);
  const isDisabled = disabled ?? itemContext.disabled;
  const setComposedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      if (!isDisabled) itemContext.setActivatorNodeRef(node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [isDisabled, itemContext, ref],
  );

  return (
    <button
      type="button"
      aria-controls={itemContext.id}
      data-disabled={isDisabled ? "" : undefined}
      data-dragging={itemContext.isDragging ? "" : undefined}
      data-slot="sortable-item-handle"
      {...itemHandleProps}
      {...(isDisabled ? {} : itemContext.attributes)}
      {...(isDisabled ? {} : itemContext.listeners)}
      ref={setComposedRef}
      disabled={isDisabled}
    />
  );
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.35",
      },
    },
  }),
};

interface SortableOverlayProps
  extends Omit<React.ComponentProps<typeof DragOverlay>, "children"> {
  container?: Element | DocumentFragment | null;
  children?:
    | ((params: { value: UniqueIdentifier }) => React.ReactNode)
    | React.ReactNode;
}

function SortableOverlay({
  container: containerProp,
  children,
  ...overlayProps
}: SortableOverlayProps) {
  const context = useSortableContext(OVERLAY_NAME);
  if (!context.activeId) return null;

  const container = containerProp ?? globalThis.document?.body ?? null;
  if (!container) return null;

  return ReactDOM.createPortal(
    <DragOverlay
      dropAnimation={dropAnimation}
      modifiers={context.modifiers}
      {...overlayProps}
    >
      <SortableOverlayContext.Provider value>
        {typeof children === "function"
          ? children({ value: context.activeId })
          : children}
      </SortableOverlayContext.Provider>
    </DragOverlay>,
    container,
  );
}

export {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
  type SortableProps,
};
