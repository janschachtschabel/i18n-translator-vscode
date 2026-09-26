/** Makes the field as high as its text (design §7.1: never scroll inside a cell); without a layout, it keeps one line. */
export function grow(field: HTMLTextAreaElement): void {
  field.style.height = 'auto';
  if (field.scrollHeight > 0) {
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }
}
