export class FocusedKeyboardManager {
  private focusableElements: HTMLElement[] = [];
  private currentFocusIndex: number = 0;
  private isActive: boolean = false;
  private containerSelector: string;

  constructor(containerSelector: string) {
    this.containerSelector = containerSelector;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Only handle keys if we're in the focused container
    if (!this.isActive) return;
    
    // Ignore if typing in input fields
    if (this.isTypingContext(event.target as HTMLElement)) {
      return;
    }

    const key = event.key.toLowerCase();

    switch (key) {
      case 'j':
        event.preventDefault();
        this.navigateDown();
        break;
      case 'k':
        event.preventDefault();
        this.navigateUp();
        break;
      case 'enter':
        event.preventDefault();
        this.activateFocused();
        break;
      case 'escape':
        event.preventDefault();
        this.deactivate();
        break;
    }
  }

  private isTypingContext(element: HTMLElement): boolean {
    const tagName = element?.tagName?.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || element?.contentEditable === 'true';
  }

  activate(): void {
    this.isActive = true;
    this.updateFocusableElements();
    if (this.focusableElements.length > 0) {
      this.currentFocusIndex = 0;
      this.focusCurrentElement();
    }
  }

  deactivate(): void {
    this.isActive = false;
    this.clearAllFocus();
  }

  private updateFocusableElements(): void {
    this.focusableElements = Array.from(
      document.querySelectorAll(`${this.containerSelector} button:not([disabled])`)
    ) as HTMLElement[];
  }

  private navigateDown(): void {
    if (this.focusableElements.length === 0) return;
    
    this.currentFocusIndex = (this.currentFocusIndex + 1) % this.focusableElements.length;
    this.focusCurrentElement();
  }

  private navigateUp(): void {
    if (this.focusableElements.length === 0) return;
    
    this.currentFocusIndex = this.currentFocusIndex === 0 
      ? this.focusableElements.length - 1 
      : this.currentFocusIndex - 1;
    this.focusCurrentElement();
  }

  private focusCurrentElement(): void {
    // Remove focus class from all elements
    this.focusableElements.forEach(el => el.classList.remove('keyboard-focused'));
    
    const element = this.focusableElements[this.currentFocusIndex];
    if (element) {
      element.classList.add('keyboard-focused');
    }
  }

  private clearAllFocus(): void {
    this.focusableElements.forEach(el => el.classList.remove('keyboard-focused'));
  }

  private activateFocused(): void {
    const element = this.focusableElements[this.currentFocusIndex];
    if (element) {
      element.click();
    }
  }

  isCurrentlyActive(): boolean {
    return this.isActive;
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.clearAllFocus();
  }
}