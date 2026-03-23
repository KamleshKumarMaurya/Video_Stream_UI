import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { AudioStoryPageRoutingModule } from './audio-story-routing.module';
import { AudioStoryPage } from './audio-story.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    AudioStoryPageRoutingModule,
  ],
  declarations: [AudioStoryPage],
})
export class AudioStoryPageModule {}
