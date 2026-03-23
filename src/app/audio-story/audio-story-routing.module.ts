import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AudioStoryPage } from './audio-story.page';

const routes: Routes = [
  {
    path: '',
    component: AudioStoryPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AudioStoryPageRoutingModule {}
