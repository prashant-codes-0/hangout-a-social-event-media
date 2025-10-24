import { Directive, ElementRef, AfterViewInit, Input } from '@angular/core';

@Directive({
  selector: '[appAutofocus]',
  standalone: true
})
export class AutofocusDirective implements AfterViewInit {
  @Input() appAutofocus: boolean | string = true;

  constructor(private elementRef: ElementRef) {}

  ngAfterViewInit(): void {
    // Convert string 'false' to boolean false
    const shouldFocus = this.appAutofocus !== false && this.appAutofocus !== 'false';
    
    if (shouldFocus) {
      // Use setTimeout to ensure the element is fully rendered
      setTimeout(() => {
        this.elementRef.nativeElement.focus();
      }, 0);
    }
  }
}