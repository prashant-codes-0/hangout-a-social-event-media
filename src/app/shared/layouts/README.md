# Universal Layout System

A flexible layout system that provides consistent structure across all features in the Hangouts application.

## Architecture

The layout system consists of multiple layout components that can be dynamically switched based on the current route or application state.

### Available Layouts

#### 1. Main Layout (`MainLayoutComponent`)
- **Purpose**: Default layout for authenticated and general application pages
- **Features**:
  - Responsive navigation header with logo
  - Desktop horizontal navigation menu
  - Mobile sidebar with overlay
  - User dropdown with profile/settings/logout
  - Theme switcher
  - Footer
- **Used for**: Homepage, hangout pages, profile, settings, etc.

#### 2. Auth Layout (`AuthLayoutComponent`)
- **Purpose**: Minimal layout for authentication pages
- **Features**:
  - Simple header with logo and back button
  - Animated gradient background
  - Minimal footer
  - No navigation menu (users shouldn't navigate away during auth)
- **Used for**: Login, signup, password reset pages

### Layout Service

The `LayoutService` manages which layout is currently active:

```typescript
// Set layout programmatically
layoutService.useMainLayout();
layoutService.useAuthLayout();

// Check current layout
if (layoutService.isMainLayout()) {
  // Do something
}
```

### Automatic Layout Switching

The main `App` component automatically switches layouts based on the current route:

- Routes starting with `/auth/` → Auth Layout
- All other routes → Main Layout

## Usage

### 1. Adding New Layouts

Create a new layout component:

```typescript
@Component({
  selector: 'app-custom-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header><!-- Custom header --></header>
    <main><router-outlet></router-outlet></main>
    <footer><!-- Custom footer --></footer>
  `
})
export class CustomLayoutComponent { }
```

Add it to the layout service and app component switch statement.

### 2. Layout-Specific Styling

Each layout has its own CSS file for layout-specific styles. Component-specific styles should remain in individual components.

### 3. Responsive Design

All layouts are fully responsive:
- **Desktop**: Full navigation, horizontal menus
- **Tablet**: Collapsible navigation
- **Mobile**: Sidebar navigation with overlay

## Features

### Navigation System
- **Dynamic menu items** based on authentication state
- **Active route highlighting** with visual indicators
- **Icon integration** with SVG icon system
- **Keyboard navigation** support

### Theme Support
- **Theme switcher** in main layout header
- **Multiple themes**: Light, Dark, Cupcake, Synthwave
- **Persistent theme** selection across sessions

### Accessibility
- **ARIA labels** for interactive elements
- **Keyboard navigation** support
- **Focus management** for modals and dropdowns
- **Screen reader** friendly structure

### Performance
- **Lazy loading** of layout components
- **Computed properties** for reactive updates
- **Minimal re-renders** with Angular signals

## File Structure

```
src/app/shared/layouts/
├── main-layout/
│   ├── main-layout.component.ts
│   ├── main-layout.component.html
│   └── main-layout.component.css
├── auth-layout/
│   ├── auth-layout.component.ts
│   ├── auth-layout.component.html
│   └── auth-layout.component.css
├── layout.service.ts
├── index.ts
└── README.md
```

## Integration

The layout system is integrated at the app level:

```html
<!-- app.html -->
@switch (currentLayout()) {
  @case ('auth') {
    <app-auth-layout>
      <router-outlet />
    </app-auth-layout>
  }
  @default {
    <app-main-layout>
      <router-outlet />
    </app-main-layout>
  }
}
```

## Benefits

1. **Consistency**: Uniform navigation and structure across features
2. **Maintainability**: Centralized layout logic
3. **Flexibility**: Easy to add new layouts or modify existing ones
4. **Performance**: Shared layout components reduce bundle size
5. **User Experience**: Smooth transitions between different app sections
6. **Developer Experience**: Clear separation of layout and feature concerns

## Best Practices

1. **Keep layouts minimal**: Focus on structure, not feature-specific content
2. **Use computed properties**: For reactive layout updates
3. **Maintain accessibility**: Always include proper ARIA labels and keyboard support
4. **Test responsiveness**: Ensure layouts work on all screen sizes
5. **Document changes**: Update this README when adding new layouts or features