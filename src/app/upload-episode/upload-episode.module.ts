import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { UploadEpisodePageRoutingModule } from './upload-episode-routing.module';
import { UploadEpisodePage } from './upload-episode.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UploadEpisodePageRoutingModule,
  ],
  declarations: [UploadEpisodePage],
})
export class UploadEpisodePageModule {}
