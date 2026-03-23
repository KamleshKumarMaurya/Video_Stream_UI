import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UploadEpisodePage } from './upload-episode.page';

const routes: Routes = [
  {
    path: '',
    component: UploadEpisodePage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UploadEpisodePageRoutingModule {}
