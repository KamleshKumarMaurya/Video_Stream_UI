import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {

  form: FormGroup;

  constructor(private fb: FormBuilder, private router: Router){
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]]
    });
  }

  submit(){
    if(this.form.valid){
      // For now, just navigate to home. Replace with real auth later.
      this.router.navigateByUrl('/home');
    }else{
      this.form.markAllAsTouched();
    }
  }

}
