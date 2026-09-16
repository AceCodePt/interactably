export function describeElement(el: Element): string {
  const id = (el as HTMLElement).id;
  return id !== "" ? `${el.localName}#${id}` : el.localName;
}