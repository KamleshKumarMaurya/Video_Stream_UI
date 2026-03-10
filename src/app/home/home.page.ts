import { Component } from '@angular/core';
import { StoryService } from '../services/story.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {

  stories: any[] = [];

  constructor(public storyService: StoryService, private router: Router) {}

  ngOnInit(){
    this.storyService.getStories().subscribe((res:any)=>{
      this.stories = res || [];
    }, err => {
      console.error('Failed to fetch stories', err);
    });
  }

  openStory(story:any){
    this.router.navigateByUrl(`/story/${story.id}`);
  }

}
