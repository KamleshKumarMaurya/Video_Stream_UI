import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { StoryPageRoutingModule } from './story-routing.module';
import { StoryPage } from './story.page';
import { BottomNavComponent } from '../shared/bottom-nav/bottom-nav.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BottomNavComponent,
    StoryPageRoutingModule
  ],
  declarations: [StoryPage]
})
export class StoryPageModule {}
