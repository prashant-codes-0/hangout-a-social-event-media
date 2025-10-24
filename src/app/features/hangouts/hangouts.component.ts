import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-hangouts',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hangouts.component.html',
  styleUrls: ['./hangouts.component.css']
})
export class HangoutsComponent {
  // Main hangouts component
}