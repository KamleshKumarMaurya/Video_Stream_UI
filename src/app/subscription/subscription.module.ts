import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { SubscriptionPageRoutingModule } from './subscription-routing.module';
import { SubscriptionPage } from './subscription.page';
import { BottomNavComponent } from '../shared/bottom-nav/bottom-nav.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BottomNavComponent,
    SubscriptionPageRoutingModule,
  ],
  declarations: [SubscriptionPage],
})
export class SubscriptionPageModule {}
