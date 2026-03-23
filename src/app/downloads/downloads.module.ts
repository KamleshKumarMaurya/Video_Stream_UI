import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { DownloadsPageRoutingModule } from './downloads-routing.module';
import { DownloadsPage } from './downloads.page';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    DownloadsPageRoutingModule,
  ],
  declarations: [DownloadsPage],
})
export class DownloadsPageModule {}
