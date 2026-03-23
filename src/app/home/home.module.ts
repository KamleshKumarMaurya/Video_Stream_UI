import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HomePage } from './home.page';
import { BottomNavComponent } from '../shared/bottom-nav/bottom-nav.component';

import { HomePageRoutingModule } from './home-routing.module';
import { HttpClient, HttpClientModule } from '@angular/common/http';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BottomNavComponent,
    HomePageRoutingModule
  ],
  declarations: [HomePage]
})
export class HomePageModule {}
