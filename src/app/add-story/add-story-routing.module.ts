import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AddStoryPage } from './add-story.page';

const routes: Routes = [
  {
    path: '',
    component: AddStoryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AddStoryPageRoutingModule {}
